import base64
import json
from io import BytesIO

import pytest
from PIL import Image

from app.schemas.models import page_output_schema
from tests.batch_reservation_mock import BatchReservationMock
from tests.test_api import api  # noqa: F401 - shared fixture

REQUEST_ID = "33333333-3333-4333-8333-333333333333"
PASSAGE = "Library Reopens\n(14 March) The library welcomed residents back. —131—. The entire project was —132— financed..."


def item(number, **changes):
    value = {
        "number": number, "question": f"The entire project was ____ financed ({number}).", "context": PASSAGE,
        "options": ["(A) larger", "(B) largeness", "(C) large", "(D) largely"],
        "userChoice": "B", "correctAnswer": "(D) largely", "answerSource": "PROVIDED",
    }
    return {**value, **changes}


def picture():
    stream = BytesIO()
    Image.new("RGB", (160, 90), "white").save(stream, format="PNG")
    return "data:image/png;base64," + base64.b64encode(stream.getvalue()).decode()


def page(**extra):
    return {"request_id": REQUEST_ID, "consent": True, "provider": "openai",
            "questions": [{"number": 131, "part": 6}, {"number": 132, "part": 6}, {"number": 107, "part": 5}],
            "images": [{"dataUrl": picture()}], **extra}


def test_page_schema_only_allows_the_requested_question_numbers():
    schema = page_output_schema([132, 107])
    entry = schema["properties"]["items"]["items"]
    assert entry["properties"]["number"] == {"type": "integer", "enum": [107, 132]}
    assert schema["properties"]["items"]["maxItems"] == 6
    assert set(entry["required"]) == {"number", "question", "context", "options", "userChoice", "correctAnswer", "answerSource"}
    assert entry["additionalProperties"] is False


def test_one_screenshot_fills_every_wrong_question_found_and_reports_the_rest(api):  # noqa: F811
    output = {"items": [item(132), item(131, question="--(131)-- Its main reading room has been enlarged.", userChoice="C",
                                          correctAnswer="(D) largely")]}
    with api(draft=output) as (client, calls):
        response = client.post("/api/v1/ai/extract-page", json=page())
        assert response.status_code == 200
        body = response.json()
        assert [entry["number"] for entry in body["items"]] == [131, 132]
        first = body["items"][1]["draft"]
        assert first["part"] == 6 and first["userChoice"] == "B" and first["userChoiceState"] == "CHOSEN"
        assert first["userMistake"] == "(B) largeness" and first["correctAnswer"] == "(D) largely"
        assert first["context"] == PASSAGE
        # Reading copies the page only; the explanation is asked for later, per card.
        assert first["explanation"] is None and first["optionNotes"] == [] and first["trapTip"] == "" and first["category"] == "OTHER"
        assert body["missing"] == [107]
        assert body["usage"]["remaining"] == 2
        # One reservation and one OpenAI call for the whole page.
        assert sum(call[1].endswith("reserve_ai_request") for call in calls) == 1
        request = next(call[2] for call in calls if call[0] == "api.openai.com")
        assert request["text"]["format"]["name"] == "toeic_page"
        assert json.loads(request["input"][0]["content"][0]["text"]) == {"questions": page()["questions"]}
        assert request["input"][0]["content"][1]["type"] == "input_image"
        assert "KHÔNG giải thích" in request["instructions"] and request["reasoning"] == {"effort": "low"}
        assert "context tối đa 8.000 ký tự" in request["instructions"]
        assert "Không cắt/rút gọn bài đọc" in request["instructions"]
        assert "3.998" not in request["instructions"]


def test_items_that_do_not_fit_their_question_are_left_for_another_try(api):  # noqa: F811
    output = {"items": [
        item(132, correctAnswer="(E) invented", userChoice="D"),
        item(131, options=["(A) one", "(B) two"]),
        item(107, question="Ms. Delacroix ____ transferring.", context="", userChoice="",
             options=["(A) until", "(B) since", "(C) upon", "(D) onto"], correctAnswer="", answerSource="MISSING"),
        item(132),
    ]}
    with api(draft=output) as (client, _calls):
        body = client.post("/api/v1/ai/extract-page", json=page()).json()
    numbers = [entry["number"] for entry in body["items"]]
    assert numbers == [107, 132] and body["missing"] == [131]
    p5, p6 = body["items"]
    assert p5["draft"]["part"] == 5 and p5["draft"]["userChoiceState"] == "UNKNOWN" and p5["draft"]["userMistake"] == ""
    assert p5["draft"]["answerSource"] == "MISSING" and p5["draft"]["correctAnswer"] == ""
    # An answer that is not one of the options is dropped instead of saved.
    assert p6["draft"]["answerSource"] == "MISSING" and p6["draft"]["correctAnswer"] == ""


@pytest.mark.parametrize("change", [
    {"questions": [{"number": 131, "part": 5}]},
    {"questions": [{"number": 131, "part": 6}, {"number": 131, "part": 6}]},
    {"questions": [{"number": 201, "part": 7}]},
    {"questions": []},
    {"images": []},
    {"images": [{"dataUrl": "data:image/png;base64,YmFk"}]},
    {"consent": False},
])
def test_invalid_page_requests_never_reserve_or_call_openai(api, change):  # noqa: F811
    with api() as (client, calls):
        assert client.post("/api/v1/ai/extract-page", json=page(**change)).status_code == 422
        assert not any(call[1].endswith("reserve_ai_request") or call[0] == "api.openai.com" for call in calls)


def test_refused_reservation_never_reads_the_page(api):  # noqa: F811
    with api(reservation={"allowed": False, "code": "duplicate"}) as (client, calls):
        assert client.post("/api/v1/ai/extract-page", json=page()).status_code == 409
        assert not any(call[0] == "api.openai.com" for call in calls)


def test_malformed_page_output_is_not_retried(api):  # noqa: F811
    with api(draft={"items": "131"}) as (client, calls):
        response = client.post("/api/v1/ai/extract-page", json=page())
        assert response.status_code == 502 and "ghi tay" in response.json()["detail"]
        assert sum(call[0] == "api.openai.com" for call in calls) == 1


BATCH = "99999999-9999-4999-8999-999999999999"
OTHER_USER = "55555555-5555-4555-8555-555555555555"


def chunk(n, batch_id=BATCH):
    # Each request of a capture is a new request id; only the batch id is shared.
    return page(request_id=f"33333333-3333-4333-8333-{n:012d}", **({"batch_id": batch_id} if batch_id else {}))


def test_only_the_first_request_of_a_capture_is_charged(api):  # noqa: F811
    mock = BatchReservationMock()
    with api(draft={"items": [item(131)]}, batch_mock=mock) as (client, calls):
        first = client.post("/api/v1/ai/extract-page", json=chunk(1))
        second = client.post("/api/v1/ai/extract-page", json=chunk(2))
        assert first.status_code == 200 and second.status_code == 200
        # The account was charged once, so the second request reports the same remaining uses.
        assert first.json()["usage"]["remaining"] == second.json()["usage"]["remaining"] == 26
        assert mock.account_used == {"11111111-1111-4111-8111-111111111111": 1}
        # Both requests still counted for the shared safety caps and both read their screenshots.
        assert mock.global_used == 2
        assert sum(call[1].endswith("reserve_ai_batch_request") for call in calls) == 2
        assert not any(call[1].endswith("/reserve_ai_request") for call in calls)
        assert sum(call[0] == "api.openai.com" for call in calls) == 2
        sent = [call[2] for call in calls if call[1].endswith("reserve_ai_batch_request")]
        assert all(body["p_batch_id"] == BATCH and body["p_max_chunks"] == 4 and body["p_ttl_seconds"] == 3600 for body in sent)


def test_a_fifth_request_of_one_capture_is_refused_before_reading_the_page(api):  # noqa: F811
    mock = BatchReservationMock()
    with api(draft={"items": [item(131)]}, batch_mock=mock) as (client, calls):
        assert [client.post("/api/v1/ai/extract-page", json=chunk(n)).status_code for n in range(1, 5)] == [200] * 4
        openai_calls = sum(call[0] == "api.openai.com" for call in calls)
        refused = client.post("/api/v1/ai/extract-page", json=chunk(5))
        assert refused.status_code == 429 and "lần chụp mới" in refused.json()["detail"]
        assert sum(call[0] == "api.openai.com" for call in calls) == openai_calls
        assert mock.global_used == 4 and sum(mock.account_used.values()) == 1


def test_owners_never_share_a_capture(api):  # noqa: F811
    mock = BatchReservationMock()
    with api(draft={"items": [item(131)]}, batch_mock=mock) as (client, _calls):
        assert client.post("/api/v1/ai/extract-page", json=chunk(1)).status_code == 200
    # A different account reusing the same batch id pays for its own capture.
    with api(draft={"items": [item(131)]}, batch_mock=mock, auth_user={"id": OTHER_USER}) as (client, _calls):
        assert client.post("/api/v1/ai/extract-page", json=chunk(2)).status_code == 200
    assert mock.account_used == {"11111111-1111-4111-8111-111111111111": 1, OTHER_USER: 1}


def test_a_request_without_a_batch_id_is_charged_as_before(api):  # noqa: F811
    with api(draft={"items": [item(131)]}) as (client, calls):
        assert client.post("/api/v1/ai/extract-page", json=chunk(1, None)).status_code == 200
        assert sum(call[1].endswith("/reserve_ai_request") for call in calls) == 1
        assert not any(call[1].endswith("reserve_ai_batch_request") for call in calls)


def test_a_malformed_batch_id_never_reserves(api):  # noqa: F811
    with api() as (client, calls):
        assert client.post("/api/v1/ai/extract-page", json=chunk(1, "not-a-uuid")).status_code == 422
        assert not any("reserve_ai" in call[1] or call[0] == "api.openai.com" for call in calls)


def test_health_announces_page_extraction(api):  # noqa: F811
    with api() as (client, _calls):
        health = client.get("/health").json()
        assert health["page_image_extraction"] is True and health["result_image_reading"] is True


def results(**extra):
    return {"request_id": REQUEST_ID, "consent": True, "provider": "openai", "images": [{"dataUrl": picture()}], **extra}


def test_a_result_page_gives_sorted_wrong_and_skipped_numbers(api):  # noqa: F811
    with api(draft={"wrong": [115, 107, 113, 107, 0, 250], "skipped": [117, 113, 128]}) as (client, calls):
        response = client.post("/api/v1/ai/read-results", json=results())
        assert response.status_code == 200
        body = response.json()
        # Invalid numbers are dropped and a number marked wrong is not also skipped.
        assert body["wrong"] == [107, 113, 115] and body["skipped"] == [117, 128]
        assert body["usage"]["remaining"] == 2
        assert sum(call[1].endswith("reserve_ai_request") for call in calls) == 1
        request = next(call[2] for call in calls if call[0] == "api.openai.com")
        assert request["text"]["format"]["name"] == "toeic_results" and request["reasoning"] == {"effort": "low"}
        assert [part["type"] for part in request["input"][0]["content"]] == ["input_image"]
        assert body["scores"] == {"listening": None, "reading": None, "total": None}


@pytest.mark.parametrize("scores", [
    {"listening": 375, "reading": 370, "total": 745},
    {"listening": None, "reading": None, "total": 800},
    {"listening": 375, "reading": None, "total": None},
    {"listening": None, "reading": None, "total": None},
])
def test_result_scores_copy_visible_values_without_converting_wrong_counts(api, scores):  # noqa: F811
    with api(draft={"wrong": [3, 107], "skipped": [], "scores": scores}) as (client, calls):
        response = client.post("/api/v1/ai/read-results", json=results())
        assert response.status_code == 200
        assert response.json()["scores"] == scores
        assert response.json()["wrong"] == [3, 107]
        assert sum(call[0] == "api.openai.com" for call in calls) == 1
        request = next(call[2] for call in calls if call[0] == "api.openai.com")
        schema = request["text"]["format"]["schema"]
        assert set(schema["required"]) == {"wrong", "skipped", "scores", "timing"}
        assert set(schema["properties"]["scores"]["required"]) == {"listening", "reading", "total"}
        assert "Không tự quy đổi" in request["instructions"]
        assert "Không tự cộng L/R" in request["instructions"]


@pytest.mark.parametrize("patch", [{"totalSeconds": 6721}, {"readingSeconds": 4490},
                                   {"parts": {"part5": 870}}, {}])
def test_elapsed_timing_uses_same_paid_request_without_inference(api, patch):  # noqa: F811 - pytest fixture
    timing = {"totalSeconds": None, "listeningSeconds": None, "readingSeconds": None,
              "parts": {f"part{part}": None for part in range(1, 8)}}
    timing.update(patch)
    if "parts" in patch:
        timing["parts"] = {f"part{part}": patch["parts"].get(f"part{part}") for part in range(1, 8)}
    with api(draft={"wrong": [107], "skipped": [], "timing": timing}) as (client, calls):
        reply = client.post("/api/v1/ai/read-results", json=results())
        assert reply.status_code == 200 and reply.json()["timing"] == timing
        assert sum(call[0] == "api.openai.com" for call in calls) == 1
        request = next(call[2] for call in calls if call[0] == "api.openai.com")
        assert "thời gian còn lại" in request["instructions"] and "không tự cộng" in request["instructions"]
        def check_strict(schema):
            if schema.get("type") == "object":
                assert schema["additionalProperties"] is False
                assert set(schema["properties"]) == set(schema["required"])
                for value in schema["properties"].values():
                    check_strict(value)
        check_strict(request["text"]["format"]["schema"])


@pytest.mark.parametrize("value", [-1, 86401, True, "112", 1.5])
def test_invalid_elapsed_timing_is_not_retried(api, value):  # noqa: F811 - pytest fixture
    with api(draft={"wrong": [], "skipped": [], "timing": {"totalSeconds": value}}) as (client, calls):
        assert client.post("/api/v1/ai/read-results", json=results()).status_code == 502
        assert sum(call[0] == "api.openai.com" for call in calls) == 1


@pytest.mark.parametrize("scores", [
    {"listening": 500, "reading": 370, "total": 870},
    {"listening": True, "reading": None, "total": None},
    {"listening": None, "reading": None, "total": 803},
])
def test_invalid_source_score_output_is_not_retried(api, scores):  # noqa: F811
    with api(draft={"wrong": [], "skipped": [], "scores": scores}) as (client, calls):
        assert client.post("/api/v1/ai/read-results", json=results()).status_code == 502
        assert sum(call[0] == "api.openai.com" for call in calls) == 1


@pytest.mark.parametrize("change", [{"images": []}, {"images": [{"dataUrl": "data:image/png;base64,YmFk"}]}, {"consent": False}])
def test_invalid_result_requests_never_reserve_or_call_openai(api, change):  # noqa: F811
    with api() as (client, calls):
        assert client.post("/api/v1/ai/read-results", json=results(**change)).status_code == 422
        assert not any(call[1].endswith("reserve_ai_request") or call[0] == "api.openai.com" for call in calls)


def test_unreadable_result_output_is_reported_without_retry(api):  # noqa: F811
    with api(draft={"wrong": "107"}) as (client, calls):
        response = client.post("/api/v1/ai/read-results", json=results())
        assert response.status_code == 502 and "chạm vào các câu sai" in response.json()["detail"]
        assert sum(call[0] == "api.openai.com" for call in calls) == 1


def test_an_unreadable_item_does_not_lose_the_others(api):  # noqa: F811
    output = {"items": [item(131, question="", context=""), item(132)]}
    with api(draft=output) as (client, _calls):
        body = client.post("/api/v1/ai/extract-page", json=page()).json()
    assert [entry["number"] for entry in body["items"]] == [132]
    assert body["missing"] == [131, 107]
    with api(draft={"items": [{"number": 131}]}) as (client, calls):
        body = client.post("/api/v1/ai/extract-page", json=page()).json()
        assert body["items"] == [] and body["missing"] == [131, 132, 107]
        assert sum(call[0] == "api.openai.com" for call in calls) == 1


def test_a_long_passage_is_kept_in_full_with_its_tail_evidence(api):  # noqa: F811
    context = ("Long passage —132—. " * 240) + "Final evidence: delivery fee is $19."
    assert len(context) > 4800
    with api(draft={"items": [item(132, context=context)]}) as (client, _calls):
        body = client.post("/api/v1/ai/extract-page", json=page()).json()
    draft = body["items"][0]["draft"]
    assert draft["context"] == context
    assert draft["questionContext"] == item(132)["question"] + "\n\n" + context


def test_oversized_context_is_reported_missing_instead_of_explaining_a_truncated_passage(api):  # noqa: F811
    with api(draft={"items": [item(132, context="Long passage —132—. " * 401)]}) as (client, calls):
        body = client.post("/api/v1/ai/extract-page", json=page()).json()
    assert body["items"] == []
    assert 132 in body["missing"]
    assert not body["explainTicket"]
    assert sum(call[0] == "api.openai.com" for call in calls) == 1


def test_a_part6_passage_without_the_question_number_is_not_kept(api):  # noqa: F811
    other = "Curci Appointed CEO\nMr. Curci shares our —139.— to excellence. “I —141.— thrilled,” said Mr. Curci."
    output = {"items": [item(131, context=other), item(132, context="")]}
    with api(draft=output) as (client, _calls):
        body = client.post("/api/v1/ai/extract-page", json=page()).json()
    # 131 came with another text's passage (a mix-up between screenshots): left for another try, not saved wrong.
    # 132 has no passage at all, which is incomplete but not wrong, so it is kept.
    assert [entry["number"] for entry in body["items"]] == [132]
    assert body["missing"] == [131, 107]
    assert body["items"][0]["draft"]["context"] == ""

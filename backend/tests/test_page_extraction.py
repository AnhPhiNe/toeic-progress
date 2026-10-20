import base64
import json
from io import BytesIO

import pytest
from PIL import Image

from app.schemas.models import page_output_schema
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

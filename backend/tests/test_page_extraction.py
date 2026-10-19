import base64
import json
from io import BytesIO

import pytest
from PIL import Image

from app.schemas.models import page_output_schema
from tests.test_api import api  # noqa: F401 - shared fixture

REQUEST_ID = "33333333-3333-4333-8333-333333333333"
NOTES = [{"label": label, "pos": "", "meaning": meaning} for label, meaning in
         (("A", "một đợt bán sách cũ"), ("B", "đóng cửa sớm"), ("C", "trung tâm gần đó"), ("D", "thay đổi gần như mọi phần"))]
EXPLANATION = {"quickTip": "Đọc câu trước và sau chỗ trống.", "translation": "", "questionType": "", "evidence": "",
               "paraphrase": "", "analysis": "Dấu hiệu: câu trước nói về việc cải tạo.", "keyVocabulary": ""}
PASSAGE = "Library Reopens\n(14 March) The Ashcombe Public Library welcomed residents back..."


def item(number, **changes):
    value = {
        "number": number, "part": 6, "category": "OTHER", "question": f"The entire project was ____ financed ({number}).",
        "context": PASSAGE, "userMistake": "", "correctAnswer": "(D) largely", "answerSource": "PROVIDED",
        "options": ["(A) larger", "(B) largeness", "(C) large", "(D) largely"], "tags": ["adverb"], "missingInformation": [],
        "userChoice": "B", "optionNotes": [{**note, "meaning": note["meaning"]} for note in NOTES], "explanation": EXPLANATION,
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
    assert "number" in entry["required"] and "questionContext" not in entry["properties"]


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
        assert first["context"] == PASSAGE and first["trapTip"]
        assert body["missing"] == [107]
        assert body["usage"]["remaining"] == 2
        # One reservation and one OpenAI call for the whole page.
        assert sum(call[1].endswith("reserve_ai_request") for call in calls) == 1
        request = next(call[2] for call in calls if call[0] == "api.openai.com")
        assert request["text"]["format"]["name"] == "toeic_page"
        assert json.loads(request["input"][0]["content"][0]["text"]) == {"questions": page()["questions"]}
        assert request["input"][0]["content"][1]["type"] == "input_image"
        assert "NHIỀU CÂU TRONG MỘT LẦN" in request["instructions"]


def test_items_that_do_not_fit_their_question_are_left_for_another_try(api):  # noqa: F811
    output = {"items": [
        item(132, correctAnswer="(E) invented", userChoice="D"),
        item(131, options=["(A) one", "(B) two"], optionNotes=NOTES[:2]),
        item(107, part=6, question="Ms. Delacroix ____ transferring.", context="", userChoice="",
             options=["(A) until", "(B) since", "(C) upon", "(D) onto"], correctAnswer="(B) since", answerSource="AI_PROPOSED"),
        item(132),
    ]}
    with api(draft=output) as (client, _calls):
        body = client.post("/api/v1/ai/extract-page", json=page()).json()
    numbers = [entry["number"] for entry in body["items"]]
    assert numbers == [107, 132] and body["missing"] == [131]
    p5, p6 = body["items"]
    assert p5["draft"]["part"] == 5 and p5["draft"]["userChoiceState"] == "UNKNOWN" and p5["draft"]["userMistake"] == ""
    assert p5["draft"]["answerSource"] == "AI_PROPOSED" and p5["draft"]["correctAnswer"] == "(B) since"
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
    with api(draft={"items": [{"number": 131}]}) as (client, calls):
        response = client.post("/api/v1/ai/extract-page", json=page())
        assert response.status_code == 502 and "ghi tay" in response.json()["detail"]
        assert sum(call[0] == "api.openai.com" for call in calls) == 1


def test_health_announces_page_extraction(api):  # noqa: F811
    with api() as (client, _calls):
        assert client.get("/health").json()["page_image_extraction"] is True

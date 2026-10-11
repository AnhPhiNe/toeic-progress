import json

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from test_image_input import image_url
from test_openai import DRAFT, completed, run_provider

from app.core.config import Settings
from app.main import create_app
from app.schemas.models import ExtractRequest, MistakeInput

QUESTION = "Which workshop is free?"
OPTIONS = ["(A) Writing.", "(B) Planning.", "(C) Data Basics.", "(D) Leadership."]
RAW = "**Câu hỏi**\n178\n**" + QUESTION + "**\nB. Planning.&#x20;\nA. Writing.\nC. Data Basics.\nD. Leadership."


def source(**changes):
    return {"rawText": RAW, "question": "", "options": [], "context": "", "part": 7,
            "userChoiceState": "UNKNOWN", "userChoice": "", "userReason": "", "sourceAnswer": "", **changes}


def output(**changes):
    return {**DRAFT, "inputIssue": "", "question": QUESTION, "context": "", "part": 7,
            "options": OPTIONS, "answerSource": "AI_PROPOSED", "correctAnswer": OPTIONS[2],
            "optionNotes": [{"label": label, "pos": "", "meaning": label} for label in "ABCD"], **changes}


def run(fields, draft, **kwargs):
    response = completed(output=[{"type": "message", "role": "assistant", "status": "completed",
                                 "content": [{"type": "output_text", "text": json.dumps(draft)}]}])
    return run_provider(lambda _request: httpx.Response(200, json=response), text=json.dumps(fields),
                        generate_kwargs={"source_answer": fields["sourceAnswer"], **kwargs})


def test_raw_paste_reaches_one_provider_call_and_source_labels_are_kept_instead_of_position():
    result, calls = run(source(), output(), images=[image_url()], persistent_images=True)
    assert len(calls) == 1 and not isinstance(result, HTTPException)
    assert result.question == QUESTION and result.options == OPTIONS and result.context == ""
    payload = json.loads(calls[0].content)
    assert json.loads(payload["input"][0]["content"][0]["text"])["rawText"] == RAW
    props = payload["text"]["format"]["schema"]["properties"]
    assert props["part"]["enum"] == [7] and "enum" not in props["question"] and "enum" not in props["correctAnswer"]
    assert "inputIssue" in props
    assert props["options"]["items"]["pattern"] == r"^\([A-D]\) .+"


@pytest.mark.parametrize("format", ["{label}. {text}", "{label}) {text}", "{label}: {text}", "{label}- {text}", "({label}) {text}"])
def test_freeform_output_normalizes_explicit_label_format_without_changing_source_text(format):
    extracted = [format.format(label=option[1].lower(), text=option[4:]) for option in OPTIONS]
    result, calls = run(source(), output(options=extracted), images=[image_url()], persistent_images=True)
    assert len(calls) == 1 and not isinstance(result, HTTPException)
    assert result.options == OPTIONS and result.correctAnswer == OPTIONS[2]


def test_output_without_labels_is_not_guessed_and_explicit_label_swaps_remain_rejected():
    for options in ([option[4:] for option in OPTIONS],
                    ["A. Planning.", "B. Writing.", "C. Data Basics.", "D. Leadership."],
                    ["A. Invented content.", *OPTIONS[1:]]):
        result, calls = run(source(), output(options=options))
        assert len(calls) == 1 and result.status_code == 502


@pytest.mark.parametrize("issue, message", [("MULTIPLE_QUESTIONS", "nhiều câu"),
                                           ("MISSING_QUESTION", "Chưa tìm thấy câu hỏi"), ("MISSING_OPTIONS", "đủ phương án")])
def test_ambiguous_or_missing_data_returns_an_actionable_issue_without_retry(issue, message):
    result, calls = run(source(), output(inputIssue=issue, question="", context="", options=[], optionNotes=[],
                                       correctAnswer="", answerSource="MISSING"))
    assert len(calls) == 1 and result.status_code == 422 and message in result.detail


@pytest.mark.parametrize("changes", [{"question": "Which course is free?"}, {"options": [*OPTIONS[:3], "(D) Hotel."]},
                                    {"options": ["(A) Planning.", "(B) Writing.", *OPTIONS[2:]]},
                                    {"context": "This passage was invented."}])
def test_ai_cannot_invent_source_wording_or_swap_explicit_option_labels(changes):
    result, calls = run(source(), output(**changes))
    assert len(calls) == 1 and result.status_code == 502
    assert "chưa khớp nguyên văn" in result.detail


def test_reason_and_copied_answer_annotations_are_not_source_keys():
    result, _ = run(source(rawText=RAW + "\nĐáp án: A", userReason="Đáp án chuẩn: B"), output())
    assert result.correctAnswer == OPTIONS[2] and result.answerSource == "AI_PROPOSED"
    provided, _ = run(source(sourceAnswer="B"), output())
    assert provided.correctAnswer == OPTIONS[1] and provided.answerSource == "PROVIDED"


@pytest.mark.parametrize("part", range(1, 8))
def test_raw_paste_works_for_each_part_and_does_not_require_a_preparsed_option_array(part):
    options = OPTIONS[:3] if part == 2 else OPTIONS
    question = "Part 1 · Mô tả tranh" if part == 1 else QUESTION
    fields = source(part=part, rawText=("" if part == 1 else QUESTION + "\n") + "\n".join(options))
    result, calls = run(fields, output(part=part, question=question, options=options,
                                      optionNotes=[{"label": label, "pos": "", "meaning": label} for label in "ABCD"[:len(options)]]),
                        images=[image_url()] if part == 1 else [])
    assert len(calls) == 1 and not isinstance(result, HTTPException) and result.part == part


def test_freeform_request_keeps_part_image_count_and_size_checks_before_generation():
    fields = {"text": json.dumps(source()), "input": source(), "request_id": "22222222-2222-4222-8222-222222222222",
              "consent": True, "provider": "openai"}
    assert ExtractRequest.model_validate(fields).input.rawText == RAW
    # Multiple questions go to the LLM for a clear issue, instead of a regex format rejection.
    assert MistakeInput.model_validate(source(rawText=RAW + "\n179\nAnother question?"))
    assert MistakeInput.model_validate(source(context="Three passages. " * 300)).context
    for changes in ({"input": source(part=1)}, {"input": source(part=5), "images": [{"dataUrl": image_url()}]},
                    {"input": source(part=1), "images": [{"dataUrl": image_url()}] * 2},
                    {"input": source(question="Preparsed question")}, {"input": source(rawText="a" * 8000)}):
        with pytest.raises(ValidationError):
            ExtractRequest.model_validate({**fields, **changes})


def test_route_reserves_once_and_uses_verified_identity_and_learner_metadata_after_extraction():
    calls = []
    fields = source(userChoiceState="CHOSEN", userChoice="D", userReason="My reason, not a source key.")
    def respond(request):
        path = request.url.path
        calls.append(path)
        if path == "/auth/v1/user":
            return httpx.Response(200, json={"id": "11111111-1111-4111-8111-111111111111", "is_anonymous": False})
        if path.endswith("reserve_ai_request"):
            return httpx.Response(200, json={"allowed": True, "remaining": 9, "limit": 10})
        if path == "/v1/responses":
            sent = json.loads(request.content)
            assert json.loads(sent["input"][0]["content"][0]["text"])["rawText"] == RAW
            return httpx.Response(200, json=completed(output=[{"type": "message", "role": "assistant", "status": "completed",
                                      "content": [{"type": "output_text", "text": json.dumps(output(userMistake="Invented choice"))}]}]))
        raise AssertionError(path)
    settings = Settings(_env_file=None, supabase_url="https://database.example", supabase_publishable_key="public",
                        supabase_secret_key="secret", rate_limit_secret="rate", openai_api_key="private")
    with TestClient(create_app(settings, httpx.MockTransport(respond))) as client:
        reply = client.post("/api/v1/ai/extract", headers={"Authorization": "Bearer user"}, json={
            "text": json.dumps(fields), "input": fields, "request_id": "22222222-2222-4222-8222-222222222222",
            "provider": "openai", "consent": True})
        assert reply.status_code == 200
        draft = reply.json()["draft"]
        assert draft["question"] == QUESTION and draft["options"] == OPTIONS
        assert draft["userChoice"] == "D" and draft["userReason"] == fields["userReason"]
        assert draft["userMistake"] == OPTIONS[3] + " - " + fields["userReason"]
        assert calls.count("/v1/responses") == 1 and sum(path.endswith("reserve_ai_request") for path in calls) == 1

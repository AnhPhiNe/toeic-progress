import asyncio
import json

import httpx
import pytest
from fastapi import HTTPException

from app.core.config import Settings
from app.integrations.openai_provider import OpenAIProvider

TEXT = "Reports should ____ submitted. (A) are (B) be. Tôi chọn A. Đáp án chuẩn: B."
DRAFT = {
    "part": 5, "category": "ADVANCED_GRAMMAR", "questionContext": TEXT,
    "userMistake": "Chọn A", "correctAnswer": "(B) be",
    "options": ["(A) are", "(B) be"], "tags": [], "missingInformation": [], "answerSource": "PROVIDED",
    "userChoice": "A",
    "optionNotes": [{"label": "A", "pos": "v", "meaning": "to be, hiện tại số nhiều"},
                    {"label": "B", "pos": "v", "meaning": "nguyên thể"}],
    "explanation": {"quickTip": "Kiểm tra cấu trúc bị động.", "translation": "", "questionType": "",
                    "evidence": "", "paraphrase": "", "analysis": "", "keyVocabulary": ""},
}


def explanation(**sections):
    return {**DRAFT["explanation"], "quickTip": "", **sections}


def completed(**changes):
    return {
        "status": "completed", "usage": {"input_tokens": 300, "output_tokens": 600},
        "output": [{"type": "reasoning"}, {
            "type": "message", "role": "assistant", "status": "completed",
            "content": [{"type": "output_text", "text": json.dumps(DRAFT)}],
        }], **changes,
    }


def run_provider(responder, text=TEXT, generate_kwargs=None, **changes):
    async def run():
        calls = []
        settings = Settings(_env_file=None, openai_api_key="private-openai-key", **changes)
        def transport(request):
            calls.append(request)
            return responder(request)
        async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as client:
            try:
                result = await OpenAIProvider(settings, client).generate(text, "opaque-user-hash", **(generate_kwargs or {}))
            except HTTPException as error:
                result = error
        return result, calls
    return asyncio.run(run())


def test_official_responses_api_uses_medium_and_strict_schema_without_sampling_or_storage():
    result, calls = run_provider(lambda _request: httpx.Response(200, json=completed()))
    assert result.correctAnswer == "(B) be" and len(calls) == 1
    request = calls[0]
    assert str(request.url) == "https://api.openai.com/v1/responses"
    assert request.headers["authorization"] == "Bearer private-openai-key"
    body = json.loads(request.content)
    assert body["model"] == "gpt-6-luna" and body["reasoning"] == {"effort": "medium"}
    assert body["store"] is False and body["service_tier"] == "default"
    assert body["max_output_tokens"] == 8192 and body["safety_identifier"] == "opaque-user-hash"
    assert "temperature" not in body and "top_p" not in body
    schema = body["text"]["format"]["schema"]
    assert schema["additionalProperties"] is False
    assert set(schema["required"]) == set(schema["properties"])
    assert {"question", "context", "userChoice", "optionNotes", "explanation"} <= set(schema["required"])
    assert "trapTip" not in schema["properties"] and "questionContext" not in schema["properties"]
    assert result.userChoice == "A" and [note.label for note in result.optionNotes] == ["A", "B"]


def test_strict_schema_rejects_a_draft_without_the_learner_choice():
    draft = {key: value for key, value in DRAFT.items() if key != "userChoice"}
    response = completed(output=[{
        "type": "message", "role": "assistant", "status": "completed",
        "content": [{"type": "output_text", "text": json.dumps(draft)}],
    }])
    result, _calls = run_provider(lambda _request: httpx.Response(200, json=response))
    assert isinstance(result, HTTPException) and result.status_code == 502


def test_high_is_an_explicit_configuration_change():
    _result, calls = run_provider(lambda _request: httpx.Response(200, json=completed()), openai_reasoning_effort="high")
    assert json.loads(calls[0].content)["reasoning"] == {"effort": "high"}


@pytest.mark.parametrize("value", [
    completed(status="incomplete", incomplete_details={"reason": "max_output_tokens"}),
    completed(output=[{"type": "message", "role": "assistant", "status": "completed",
                       "content": [{"type": "refusal", "refusal": "Cannot process"}]}]),
    completed(output=[]),
    completed(output=[{"type": "message", "role": "assistant", "status": "completed",
                       "content": [{"type": "output_text", "text": "not JSON"}]}]),
])
def test_incomplete_refused_or_malformed_output_is_not_retried_or_saved(value):
    result, calls = run_provider(lambda _request: httpx.Response(200, json=value))
    assert result.status_code == 502 and len(calls) == 1


def test_missing_answer_is_grounded_even_if_provider_invents_one():
    result, _calls = run_provider(lambda _request: httpx.Response(200, json=completed()), text="Reports should ____ submitted. (A) are (B) be. Tôi chọn A.")
    assert result.correctAnswer == "" and result.answerSource == "MISSING"


@pytest.mark.parametrize("billing", [False, True])
def test_rate_limits_and_billing_are_distinct_without_key_rotation(billing):
    result, calls = run_provider(lambda _request: httpx.Response(
        429, json={"error": {"code": "insufficient_quota" if billing else "rate_limit_exceeded"}},
        headers={"Retry-After": "75"},
    ))
    assert result.status_code == (503 if billing else 429) and len(calls) == 1
    if not billing:
        assert result.headers["Retry-After"] == "75"
        assert "OpenAI đang giới hạn tốc độ" in result.detail
    else:
        assert "không phải giới hạn lượt của tài khoản" in result.detail


@pytest.mark.parametrize("status,text", [
    (401, "chưa được OpenAI cho phép"),
    (403, "chưa được OpenAI cho phép"),
    (400, "OpenAI từ chối yêu cầu"),
    (500, "OpenAI tạm gặp sự cố"),
])
def test_provider_errors_explain_the_recovery_without_exposing_raw_errors(status, text):
    result, calls = run_provider(lambda _request: httpx.Response(status, json={"error": "private upstream details"}))
    assert result.status_code == 503 and text in result.detail and len(calls) == 1
    assert "private upstream details" not in result.detail


def test_timeout_does_not_duplicate_billed_requests_or_log_keys(caplog):
    def timeout(request):
        raise httpx.ReadTimeout("private-openai-key", request=request)
    result, calls = run_provider(timeout)
    assert result.status_code == 503 and len(calls) == 1
    assert "private-openai-key" not in result.detail
    assert not any("private-openai-key" in record.message for record in caplog.records)


def test_ai_configuration_has_one_provider_and_requires_its_key():
    settings = Settings(
        _env_file=None, openai_api_key="private-openai-key",
        supabase_url="https://database.example", supabase_publishable_key="public", supabase_secret_key="server",
        turnstile_secret_key="turnstile", rate_limit_secret="rate",
    )
    assert settings.ai_ready and settings.ai_provider == "openai"
    assert settings.model_copy(update={"turnstile_secret_key": ""}).ai_ready
    assert "ai_provider" not in Settings.model_fields
    assert "private-openai-key" not in repr(settings) and "private-openai-key" not in settings.model_dump_json()
    assert not settings.model_copy(update={"openai_api_key": Settings(_env_file=None).openai_api_key}).ai_ready


@pytest.mark.parametrize("answer_provided", [True, False])
def test_structured_explanation_becomes_labeled_text_and_keeps_the_answer_contract(answer_provided):
    source = (
        "Part 5. All bank transfers are ____ to review and could be delayed if an issue is identified. "
        "(A) required (B) imaginary (C) conscious (D) subject. Tôi chọn A vì hiểu required là được yêu cầu."
        + ("\nĐáp án chuẩn: D." if answer_provided else "")
    )
    options = ["(A) required", "(B) imaginary", "(C) conscious", "(D) subject"]
    draft = {**DRAFT, "category": "VOCABULARY_TRAP", "questionContext": source, "options": options,
             "correctAnswer": "(D) subject",
             "optionNotes": [{"label": "A", "pos": "adj", "meaning": "bắt buộc"},
                             {"label": "B", "pos": "adj", "meaning": "tưởng tượng"},
                             {"label": "C", "pos": "adj", "meaning": "có ý thức"},
                             {"label": "D", "pos": "adj", "meaning": "be subject to: thuộc diện"}],
             "explanation": explanation(
                 translation="Mọi giao dịch chuyển khoản đều thuộc diện xét duyệt.",
                 analysis="be subject to + danh từ; be required to + động từ.",
                 keyVocabulary="bank transfer: chuyển khoản", quickTip="Kiểm tra to + danh từ hay to + động từ.")}
    response = completed(output=[{
        "type": "message", "role": "assistant", "status": "completed",
        "content": [{"type": "output_text", "text": json.dumps(draft, ensure_ascii=False)}],
    }])
    result, calls = run_provider(lambda _request: httpx.Response(200, json=response), text=source)
    assert result.options == options and result.explanation.quickTip == "Kiểm tra to + danh từ hay to + động từ."
    assert result.trapTip == (
        "Dịch ngữ cảnh: Mọi giao dịch chuyển khoản đều thuộc diện xét duyệt.\n\n"
        "Phương án: (A) (adj) bắt buộc; (B) (adj) tưởng tượng; (C) (adj) có ý thức; "
        "(D) (adj) be subject to: thuộc diện\n\n"
        "Phân tích: be subject to + danh từ; be required to + động từ.\n\n"
        "Từ vựng: bank transfer: chuyển khoản\n\n"
        "Mẹo 10s: Kiểm tra to + danh từ hay to + động từ."
    )
    assert result.correctAnswer == ("(D) subject" if answer_provided else "")
    assert result.answerSource == ("PROVIDED" if answer_provided else "MISSING")
    assert json.loads(calls[0].content)["input"][0]["content"][0]["text"] == source


def test_notes_for_options_missing_from_the_source_are_dropped():
    draft = {**DRAFT, "options": [*DRAFT["options"], "(C) invented"],
             "optionNotes": [*DRAFT["optionNotes"], {"label": "C", "pos": "v", "meaning": "invented"}]}
    response = completed(output=[{
        "type": "message", "role": "assistant", "status": "completed",
        "content": [{"type": "output_text", "text": json.dumps(draft, ensure_ascii=False)}],
    }])
    result, _calls = run_provider(lambda _request: httpx.Response(200, json=response))
    assert [note.label for note in result.optionNotes] == ["A", "B"] and "invented" not in result.trapTip


def test_part6_missing_context_remains_visible_with_option_meanings():
    source = "Part 6: ____, the office will be closed. (A) Therefore (B) However (C) Meanwhile (D) Similarly."
    draft = {**DRAFT, "part": 6, "questionContext": "____, the office will be closed.",
             "options": ["(A) Therefore", "(B) However", "(C) Meanwhile", "(D) Similarly"],
             "answerSource": "MISSING", "correctAnswer": "", "userMistake": "", "userChoice": "",
             "missingInformation": ["Thiếu câu trước để xác định quan hệ ý."],
             "optionNotes": [{"label": letter, "pos": "adv", "meaning": meaning} for letter, meaning in
                             zip("ABCD", ["vì vậy", "tuy nhiên", "trong khi đó", "tương tự"], strict=True)],
             "explanation": explanation(analysis="Cần câu trước để phân biệt kết quả, đối lập, đồng thời hay tương đồng.")}
    response = completed(output=[{
        "type": "message", "role": "assistant", "status": "completed",
        "content": [{"type": "output_text", "text": json.dumps(draft, ensure_ascii=False)}],
    }])
    result, _calls = run_provider(lambda _request: httpx.Response(200, json=response), text=source)
    assert result.part == 6 and len(result.optionNotes) == 4 and result.trapTip.startswith("Phương án: (A) (adv) vì vậy")
    assert result.correctAnswer == "" and "Thiếu câu trước để xác định quan hệ ý." in result.missingInformation


def test_openai_can_return_an_ai_proposal_when_source_answer_is_optional():
    draft = {**DRAFT, "correctAnswer": "B", "answerSource": "AI_PROPOSED"}
    response = completed(output=[{
        "type": "message", "role": "assistant", "status": "completed",
        "content": [{"type": "output_text", "text": json.dumps(draft)}],
    }])
    result, calls = run_provider(lambda _request: httpx.Response(200, json=response),
                                text="Part 5: Reports should ____ submitted. (A) are (B) be. Tôi chọn A.")
    assert len(calls) == 1 and result.correctAnswer == "(B) be" and result.answerSource == "AI_PROPOSED"


def test_structured_ai_answer_is_constrained_to_original_options_without_a_source_key():
    options = ["(A) However", "(B) Therefore", "(C) Because", "(D) Meanwhile"]
    draft = {**DRAFT, "part": 6, "options": options, "correctAnswer": options[1],
             "answerSource": "AI_PROPOSED", "userChoice": "C",
             "optionNotes": [{"label": label, "pos": "conj" if label == "C" else "adv", "meaning": meaning}
                             for label, meaning in zip("ABCD", ["tuy nhiên", "vì vậy", "bởi vì", "trong khi đó"], strict=True)]}
    response = completed(output=[{
        "type": "message", "role": "assistant", "status": "completed",
        "content": [{"type": "output_text", "text": json.dumps(draft)}],
    }])
    result, calls = run_provider(lambda _request: httpx.Response(200, json=response),
                                text='{"sourceAnswer":"","userChoice":"C"}',
                                generate_kwargs={"source_options": options, "source_answer": ""})
    assert len(calls) == 1 and result.correctAnswer == options[1] and result.answerSource == "AI_PROPOSED"
    assert result.userChoice == "C"
    properties = json.loads(calls[0].content)["text"]["format"]["schema"]["properties"]
    assert properties["correctAnswer"]["enum"] == ["", *options]


def test_request_specific_answer_constraints_do_not_leak_to_legacy_requests():
    run_provider(lambda _request: httpx.Response(200, json=completed()),
                 generate_kwargs={"source_options": DRAFT["options"], "source_answer": "B"})
    _result, calls = run_provider(lambda _request: httpx.Response(200, json=completed()))
    assert "enum" not in json.loads(calls[0].content)["text"]["format"]["schema"]["properties"]["correctAnswer"]


def test_image_question_and_wrapped_options_have_valid_strict_literals_without_changing_source_wording():
    question = "What is suggested about the students\nin a creative writing class?"
    options = ["(A) They have read Rome:\nMystery in a Minor Key.", "(B) They are beginning\twriters.",
               "(C) They are planning to travel to Rome.", "(D) They are enrolled in an evening class."]
    folded = [" ".join(option.split()) for option in options]
    draft = {**DRAFT, "part": 7, "question": " ".join(question.split()), "context": "", "options": folded,
             "correctAnswer": folded[0], "answerSource": "AI_PROPOSED", "userChoice": "",
             "optionNotes": [{"label": label, "pos": "", "meaning": "Phương án " + label} for label in "ABCD"]}
    response = completed(output=[{"type": "message", "role": "assistant", "status": "completed",
                                 "content": [{"type": "output_text", "text": json.dumps(draft)}]}])
    source = json.dumps({"question": question, "options": options, "part": 7, "context": ""})
    result, calls = run_provider(lambda _request: httpx.Response(200, json=response), text=source,
                                generate_kwargs={"source_options": options, "source_answer": "",
                                                 "images": ["data:image/jpeg;base64,fixture"], "persistent_images": True})
    assert len(calls) == 1 and not isinstance(result, HTTPException)
    assert result.question == " ".join(question.split()) and result.context == ""
    assert result.options == options and result.correctAnswer == options[0]
    properties = json.loads(calls[0].content)["text"]["format"]["schema"]["properties"]
    assert properties["question"]["enum"] == [" ".join(question.split())]
    assert properties["correctAnswer"]["enum"] == ["", *folded]


def test_listening_stem_and_transcript_share_one_request_and_invalid_extraction_is_not_retried():
    question = "What problem does the man mention?"
    transcript = "(M-Cn) The order is incomplete.\n(W-Am) We can wait until tomorrow."
    source = json.dumps({"question": "Questions 53 through 55 refer to the following conversation.\n"
                         + transcript + "\n" + question, "context": ""})
    for stem, expected_status in [(question, None), ("What issue does the man mention?", 502)]:
        draft = {**DRAFT, "part": 3, "question": stem, "context": transcript}
        draft.pop("questionContext")
        response = completed(output=[{
            "type": "message", "role": "assistant", "status": "completed",
            "content": [{"type": "output_text", "text": json.dumps(draft)}],
        }])
        result, calls = run_provider(lambda _request, value=response: httpx.Response(200, json=value), text=source,
                                    generate_kwargs={"source_options": DRAFT["options"], "source_answer": "B"})
        assert len(calls) == 1
        if expected_status:
            assert isinstance(result, HTTPException) and result.status_code == expected_status
        else:
            assert result.question == question and result.context == transcript
            assert result.questionContext == question + "\n\n" + transcript
            assert result.correctAnswer == "(B) be" and result.answerSource == "PROVIDED"


@pytest.mark.parametrize("notes", [
    [],
    [DRAFT["optionNotes"][0]],
    [DRAFT["optionNotes"][0], DRAFT["optionNotes"][0]],
    [*DRAFT["optionNotes"], {"label": "C", "pos": "n", "meaning": "không có trong phương án"}],
    [DRAFT["optionNotes"][0], {"label": "B", "pos": "v", "meaning": ""}],
    [DRAFT["optionNotes"][0], {"label": "B", "pos": "v", "meaning": " \t\n "}],
])
def test_incomplete_blank_or_duplicate_option_meanings_are_rejected_without_retry(notes):
    draft = {**DRAFT, "optionNotes": notes}
    response = completed(output=[{
        "type": "message", "role": "assistant", "status": "completed",
        "content": [{"type": "output_text", "text": json.dumps(draft, ensure_ascii=False)}],
    }])
    result, calls = run_provider(lambda _request: httpx.Response(200, json=response))
    assert isinstance(result, HTTPException) and result.status_code == 502 and len(calls) == 1


@pytest.mark.parametrize("options", [["are", "be"], ["(A) are", "(A) be"], ["(A) are", "(B)"]])
def test_unlabeled_duplicate_or_empty_ai_options_are_rejected(options):
    draft = {**DRAFT, "options": options}
    response = completed(output=[{
        "type": "message", "role": "assistant", "status": "completed",
        "content": [{"type": "output_text", "text": json.dumps(draft)}],
    }])
    result, calls = run_provider(lambda _request: httpx.Response(200, json=response))
    assert isinstance(result, HTTPException) and result.status_code == 502 and len(calls) == 1


def test_missing_source_options_allow_an_empty_notes_array_instead_of_invented_meanings():
    draft = {**DRAFT, "options": [], "optionNotes": [], "answerSource": "MISSING", "correctAnswer": "",
             "missingInformation": ["Chưa có phương án."]}
    response = completed(output=[{
        "type": "message", "role": "assistant", "status": "completed",
        "content": [{"type": "output_text", "text": json.dumps(draft)}],
    }])
    result, calls = run_provider(lambda _request: httpx.Response(200, json=response))
    assert len(calls) == 1 and result.options == [] and result.optionNotes == []
    assert result.answerSource == "MISSING" and result.correctAnswer == ""


def test_contextual_inventory_meaning_survives_the_provider_and_grounding_pipeline():
    # Mocked transport verifies preservation and coverage, not the live model's semantic quality.
    question = (
        "The latest ____ of decorations in stock indicates that Festal Seasons Ltd. "
        "is well prepared for the holiday rush."
    )
    options = ["(A) proposal", "(B) inventory", "(C) consideration", "(D) commitment"]
    meanings = ["đề xuất, bản đề xuất", "bản kiểm kê, danh mục hàng tồn", "sự xem xét, cân nhắc", "sự cam kết"]
    translation = (
        "Bản kiểm kê mới nhất về các đồ trang trí có trong kho cho thấy Công ty Festal Seasons "
        "đã chuẩn bị tốt cho đợt cao điểm dịp lễ."
    )
    draft = {
        **DRAFT, "questionContext": question, "category": "VOCABULARY_TRAP", "options": options,
        "correctAnswer": "(B) inventory", "userMistake": "Chọn A", "userChoice": "A",
        # Reverse note order: labels, not position, must preserve the correct meanings.
        "optionNotes": list(reversed([
            {"label": label, "pos": "n", "meaning": meaning}
            for label, meaning in zip("ABCD", meanings, strict=True)
        ])),
        "explanation": explanation(
            translation=translation,
            analysis="Cả bốn đều là danh từ. 'The latest inventory of ... in stock' chỉ bản kiểm kê hàng tồn.",
            quickTip="Cùng từ loại thì kiểm tra nghĩa cả cụm quanh chỗ trống, không chỉ nghĩa quen thuộc.",
        ),
    }
    response = completed(output=[{
        "type": "message", "role": "assistant", "status": "completed",
        "content": [{"type": "output_text", "text": json.dumps(draft, ensure_ascii=False)}],
    }])
    source = question + "\n" + "\n".join(options) + "\nTôi chọn A.\nĐáp án chuẩn: B."
    result, calls = run_provider(lambda _request: httpx.Response(200, json=response), text=source)
    assert len(calls) == 1 and result.correctAnswer == "(B) inventory"
    assert [note.label for note in result.optionNotes] == list("ABCD")
    assert [note.meaning for note in result.optionNotes] == meanings
    assert result.explanation.translation == translation
    assert "(B) (n) bản kiểm kê, danh mục hàng tồn" in result.trapTip


def test_legacy_explanation_text_is_bounded_without_truncating_structured_sections():
    from app.schemas.models import OpenAIDraftOutput

    sections = {"quickTip": "t" * 400, "translation": "a" * 600, "questionType": "q" * 300,
                "evidence": "e" * 800, "paraphrase": "p" * 400, "analysis": "s" * 1200, "keyVocabulary": "v" * 400}
    output = OpenAIDraftOutput(**{**DRAFT, "explanation": sections}).to_draft()
    assert len(output.trapTip) <= 4000 and "Đã rút gọn" in output.trapTip
    assert output.explanation.model_dump() == sections
    assert output.options == DRAFT["options"] and output.correctAnswer == DRAFT["correctAnswer"]

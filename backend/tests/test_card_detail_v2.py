"""Card detail v2: one-line option reasons, evidence sentences across passages, structured words."""

import json

import httpx

from app.schemas.models import Explanation, MistakeDraft, OpenAIDraftOutput, OptionNote
from app.services.toeic_prompt import OPENAI_TOEIC_PROMPT
from tests.test_openai import DRAFT, completed, run_provider

PASSAGE = (
    "Đoạn 1 — Email\nDear Harbor Hotel team,\nI am writing to ask about a refund for my stay. "
    "The air conditioning did not work.\n\n"
    "Đoạn 2 — Bảng hoàn tiền\n| Thời điểm huỷ | Hoàn tiền |\n|---|---|\n| Trước 7 ngày | 100% |\n\n"
    "Đoạn 3 — Thư trả lời\nGuests who report a problem during their stay may receive a partial refund after review."
)
QUESTION = "What will Ms. Ortiz most likely receive?"
OPTIONS = ["(A) A free night", "(B) A partial refund", "(C) A new booking", "(D) A voucher"]


def respond(draft):
    return completed(output=[{
        "type": "message", "role": "assistant", "status": "completed",
        "content": [{"type": "output_text", "text": json.dumps(draft, ensure_ascii=False)}],
    }])


def part7_draft(evidences, words=None):
    return {**DRAFT, "part": 7, "question": QUESTION, "context": PASSAGE, "options": OPTIONS,
            "correctAnswer": OPTIONS[1], "answerSource": "PROVIDED", "userChoice": "A", "userMistake": "Chọn A",
            "optionNotes": [{"label": label, "pos": "", "meaning": meaning, "reason": reason} for label, meaning, reason in zip(
                "ABCD", ["một đêm miễn phí", "hoàn tiền một phần", "đặt phòng mới", "phiếu giảm giá"],
                ["bài không hứa đêm miễn phí.", "báo lỗi trong kỳ ở được hoàn một phần.", "", ""], strict=True)],
            "explanation": {**DRAFT["explanation"], "evidences": evidences, "words": words or []},
            "ownAnswer": OPTIONS[1]}


def run_part7(draft):
    source = json.dumps({"question": QUESTION, "context": PASSAGE, "options": OPTIONS, "part": 7,
                         "sourceAnswer": "B", "userChoice": "A"}, ensure_ascii=False)
    result, _calls = run_provider(lambda _request: httpx.Response(200, json=respond(draft)), text=source,
                                  generate_kwargs={"source_options": OPTIONS, "source_answer": "B"})
    return result, _calls


def test_strict_schema_requires_reason_evidences_and_words_without_defaults():
    schema = OpenAIDraftOutput.ai_schema()
    definitions = schema["$defs"]
    assert definitions["OptionNote"]["required"] == ["label", "pos", "meaning", "reason"]
    assert {"evidences", "words"} <= set(definitions["Explanation"]["required"])
    assert definitions["Evidence"]["required"] == ["passageLabel", "text", "translation"]
    assert definitions["KeyWord"]["required"] == ["word", "meaning"]
    for definition in definitions.values():
        assert set(definition["required"]) == set(definition["properties"])
        assert all("default" not in field for field in definition["properties"].values())


def test_prompt_asks_for_one_line_reasons_and_every_verbatim_evidence_with_translation():
    assert "reason: MỘT dòng tiếng Việt, tối đa 90 ký tự" in OPENAI_TOEIC_PROMPT
    assert "evidences: Part 6/7 liệt kê TẤT CẢ câu bằng chứng" in OPENAI_TOEIC_PROMPT
    assert "double/triple passage" in OPENAI_TOEIC_PROMPT and "NGUYÊN VĂN" in OPENAI_TOEIC_PROMPT
    assert "words: cùng các từ/cụm trong keyVocabulary" in OPENAI_TOEIC_PROMPT


def test_old_cards_without_reason_evidences_or_words_still_validate():
    note = OptionNote(label="A", pos="v", meaning="là")
    assert note.reason == ""
    explanation = Explanation(**DRAFT["explanation"])
    assert explanation.evidences == [] and explanation.words == []
    draft = MistakeDraft(**{key: value for key, value in DRAFT.items()}, trapTip="")
    assert draft.optionNotes[0].reason == ""


def test_evidences_in_different_passages_are_kept_and_invented_ones_dropped():
    evidences = [
        {"passageLabel": "Đoạn 1 — Email", "text": "“I am writing to ask about a refund for my stay.”",
         "translation": "Tôi viết thư để hỏi về việc hoàn tiền."},
        {"passageLabel": "Đoạn 3 — Thư trả lời", "text": "Guests who report a problem during their stay may receive a partial refund after review.",
         "translation": "Khách báo sự cố trong kỳ ở có thể được hoàn một phần."},
        {"passageLabel": "Đoạn 2", "text": "All guests receive a full refund at any time.", "translation": "Bịa."},
    ]
    words = [{"word": "refund", "meaning": "hoàn tiền"}, {"word": " ", "meaning": "rỗng"}]
    result, _calls = run_part7(part7_draft(evidences, words))
    kept = result.explanation.evidences
    assert [item.passageLabel for item in kept] == ["Đoạn 1 — Email", "Đoạn 3 — Thư trả lời"]
    assert kept[0].text == "I am writing to ask about a refund for my stay."
    assert kept[1].translation.startswith("Khách báo sự cố")
    assert [word.word for word in result.explanation.words] == ["refund"]
    assert [note.reason for note in result.optionNotes][:2] == ["bài không hứa đêm miễn phí.", "báo lỗi trong kỳ ở được hoàn một phần."]


def test_duplicate_and_too_short_evidences_are_dropped():
    evidences = [{"passageLabel": "", "text": "refund", "translation": ""},
                 {"passageLabel": "", "text": "The air conditioning did not work.", "translation": "Máy lạnh hỏng."},
                 {"passageLabel": "", "text": "the  air conditioning did not work.", "translation": "Lặp."}]
    result, _calls = run_part7(part7_draft(evidences))
    assert [item.text for item in result.explanation.evidences] == ["The air conditioning did not work."]


def test_part5_without_a_passage_keeps_no_evidences():
    draft = {**DRAFT, "explanation": {**DRAFT["explanation"], "evidences": [
        {"passageLabel": "", "text": "Reports should ____ submitted.", "translation": "Báo cáo nên được nộp."}]}}
    result, _calls = run_provider(lambda _request: httpx.Response(200, json=respond(draft)))
    assert result.explanation.evidences == []


def test_grounding_handles_quotes_dashes_pipes_headings_and_fixes_passage_label():
    passage = (
        "Đoạn 1 — Email\n"
        "Please review 'Order 42 — urgent' before 5 PM.\n\n"
        "Đoạn 2 — Bảng giá\n"
        "| Gói | Giá |\n|---|---|\n| Pro – Năm | 100$ |\n\n"
        "Đoạn 3 — Thư trả lời\n"
        "Refunds are processed within five business days after approval."
    )
    evidences = [
        # Bare heading must be rejected
        {"passageLabel": "Đoạn 1 — Email", "text": "Đoạn 1 — Email", "translation": "Tiêu đề"},
        # Single-quoted + ASCII hyphen matching em-dash
        {"passageLabel": "Đoạn 1", "text": "'Please review 'Order 42 - urgent' before 5 PM.'", "translation": "Xem đơn 42 trước 5h."},
        # Pipe spacing & dash normalized
        {"passageLabel": "", "text": "|Pro - Năm|100$|", "translation": "Gói Pro 100$."},
        # Wrong passageLabel auto-corrected to Đoạn 3 — Thư trả lời
        {"passageLabel": "Đoạn 1 — Email", "text": "Refunds are processed within five business days after approval.", "translation": "Hoàn tiền trong 5 ngày."},
    ]
    draft = {**part7_draft(evidences), "context": passage}
    source = json.dumps({"question": QUESTION, "context": passage, "options": OPTIONS, "part": 7,
                         "sourceAnswer": "B", "userChoice": "A"}, ensure_ascii=False)
    result, _calls = run_provider(lambda _request: httpx.Response(200, json=respond(draft)), text=source,
                                  generate_kwargs={"source_options": OPTIONS, "source_answer": "B"})
    kept = result.explanation.evidences
    assert len(kept) == 3
    assert kept[0].passageLabel == "Đoạn 1 — Email"
    assert kept[1].passageLabel == "Đoạn 2 — Bảng giá"
    assert kept[2].passageLabel == "Đoạn 3 — Thư trả lời"


def test_soft_bounds_trim_excess_evidences_words_and_long_reason_instead_of_502():
    evidences = [
        {"passageLabel": "Đoạn 1 — Email", "text": "I am writing to ask about a refund for my stay.", "translation": "d1"},
        {"passageLabel": "Đoạn 1 — Email", "text": "The air conditioning did not work.", "translation": "d2"},
        {"passageLabel": "Đoạn 3 — Thư trả lời", "text": "Guests who report a problem during their stay may receive a partial refund after review.", "translation": "d3"},
        {"passageLabel": "Đoạn 2 — Bảng hoàn tiền", "text": "| Trước 7 ngày | 100% |", "translation": "d4"},
    ]
    words = [{"word": f"term{i}", "meaning": f"nghĩa {i}"} for i in range(1, 6)]
    draft = part7_draft(evidences, words)
    draft["optionNotes"][0]["reason"] = "Lý do rất dài " * 14
    result, _calls = run_part7(draft)
    assert len(result.explanation.evidences) == 3
    assert len(result.explanation.words) == 4
    assert len(result.optionNotes[0].reason) <= 160


def test_saved_card_extract_allows_long_multi_question_part7_context():
    from app.schemas.models import ExtractRequest

    long_context = ("Đoạn 1 — Email\n176. First reference. 177. Second reference.\n" + ("Detail sentence. " * 380))
    assert 5000 < len(long_context) <= 8000
    req = ExtractRequest.model_validate({
        "text": "",
        "provider": "openai",
        "consent": True,
        "request_id": "22222222-2222-4222-8222-222222222222",
        "input": {
            "part": 7,
            "question": QUESTION,
            "context": long_context,
            "options": OPTIONS,
            "userChoiceState": "CHOSEN",
            "userChoice": "A",
            "sourceAnswer": "B",
            "savedCard": True,
        },
    })
    assert req.input.savedCard is True and len(req.input.context) == len(long_context)

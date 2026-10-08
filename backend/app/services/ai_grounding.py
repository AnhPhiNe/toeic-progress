import re

from app.core.text_input import has_multiple_questions
from app.schemas.models import MistakeDraft


def normalized(value: str) -> str:
    return " ".join(value.casefold().split())


def source_option(answer: str, options: list[str]) -> str | None:
    """Accept only a choice matching an existing label AND its original text."""
    answer = normalized(answer).rstrip(" .;")
    prefix = re.match(r"^(?:\(([a-d])\)|([a-d])(?:[.):\s]|$))\s*", answer)
    label = (prefix[1] or prefix[2]) if prefix else None
    content = answer[prefix.end():].lstrip(" .):").strip() if prefix else answer
    for option in options:
        match = re.match(r"^(?:\(([a-d])\)|([a-d])[.):\s])\s*(.*)$", normalized(option), re.IGNORECASE)
        option_label = (match[1] or match[2]) if match else None
        option_content = (match[3] if match else normalized(option)).rstrip(" .;")
        if label and label == option_label and (not content or content == option_content):
            return option
        if not label and content and content == option_content:
            return option
    return None


def ground_draft(text: str, draft: MistakeDraft, *, allow_ai_answer: bool = False,
                 source_options: list[str] | None = None, source_answer: str | None = None) -> MistakeDraft:
    """Ground options; optionally admit labeled AI proposals without claiming a source key."""
    source = normalized(text)
    options = []
    canonical_options = {normalized(option): option for option in source_options} if source_options is not None else None
    for option in draft.options:
        content = re.sub(r"^(?:\([A-D]\)|[A-D][.):\s-])\s*", "", option, flags=re.IGNORECASE).strip()
        if canonical_options is not None:
            if normalized(option) in canonical_options:
                options.append(canonical_options[normalized(option)])
        elif content and normalized(content) in source:
            options.append(option)
    if len(options) != len(draft.options):
        draft.missingInformation.append("Đã bỏ phương án không tìm thấy trong nội dung gốc.")
    if source_options is not None and (len(options) != len(source_options) or len(set(options)) != len(options)):
        raise ValueError("AI omitted or changed source options")
    draft.options = options
    labels = set()
    for option in options:
        label = re.match(r"^\s*(?:\(([A-D])\)|([A-D])[.):\s])", option, re.IGNORECASE)
        if label:
            labels.add((label[1] or label[2]).upper())
    if draft.userChoice not in labels:
        # The learner's choice is only shown when it names an option that exists in the source.
        draft.userChoice = ""
    # Option meanings follow the same rule: one note per option that exists in the source.
    notes = {note.label: note for note in draft.optionNotes if note.label in labels}
    draft.optionNotes = [notes[label] for label in sorted(notes)]
    draft.compose_trap_tip()
    if source_options is None and has_multiple_questions(text):
        draft.correctAnswer, draft.answerSource = "", "MISSING"
        draft.missingInformation = list(dict.fromkeys([*draft.missingInformation, "Mỗi lần nhập một câu. Không lấy đáp án của câu khác."]))[:8]
        return draft
    provided = re.search(
        r"(?:đáp án(?:\s+(?:chuẩn|đúng))?|correct answer|answer key|answer)\s*[:=-]\s*([^\n]+)", text, re.IGNORECASE
    ) if source_answer is None else (re.match(r"(.*)", source_answer) if source_answer else None)
    if allow_ai_answer:
        if provided:
            key_prefix = re.match(r"^\s*\(?([A-D])\)?(?:[.):\s]|$)", provided[1], re.IGNORECASE)
            canonical = source_option(key_prefix[1] if key_prefix else provided[1], options)
            if canonical:
                if draft.correctAnswer and source_option(draft.correctAnswer, options) != canonical:
                    draft.missingInformation.append("AI và đáp án nguồn chưa khớp. Đã giữ đáp án nguồn; hãy kiểm tra lại phần giải thích.")
                draft.correctAnswer, draft.answerSource = canonical, "PROVIDED"
            else:
                draft.correctAnswer, draft.answerSource = "", "MISSING"
                draft.missingInformation.append("Đáp án nguồn chưa khớp phương án. Hãy kiểm tra lại, AI không tự thay đáp án nguồn.")
        elif draft.answerSource == "AI_PROPOSED" and len(options) >= 2:
            canonical = source_option(draft.correctAnswer, options)
            if canonical:
                draft.correctAnswer = canonical
                draft.missingInformation.append("Đáp án do AI đề xuất, chưa đối chiếu với đáp án nguồn. Hãy kiểm tra trước khi lưu.")
            else:
                draft.correctAnswer, draft.answerSource = "", "MISSING"
                draft.missingInformation.append("Đáp án AI đề xuất không khớp phương án gốc. Hãy bổ sung hoặc kiểm tra lại.")
        else:
            draft.correctAnswer, draft.answerSource = "", "MISSING"
            draft.missingInformation.append("Chưa đủ dữ liệu để xác định đáp án. Hãy bổ sung phương án/ngữ cảnh hoặc đáp án nguồn.")
        draft.missingInformation = list(dict.fromkeys(draft.missingInformation))[:8]
        return draft
    answer = normalized(draft.correctAnswer)
    letter = re.match(r"^\(?([a-d])\)?(?:[.):\s]|$)", answer)
    key = normalized(provided.group(1)) if provided else ""
    key_letter = re.match(r"^\(?([a-d])\)?(?:[.):\s]|$)", key)
    supported = bool(answer and key and (answer in key or (letter and key_letter and letter[1] == key_letter[1])))
    if not supported or draft.answerSource == "MISSING":
        draft.answerSource = "MISSING"
        draft.correctAnswer = ""
        draft.missingInformation.append("Đáp án chuẩn chưa được cung cấp hoặc chưa khớp; hãy bổ sung khi chỉnh sửa.")
    else:
        draft.answerSource = "PROVIDED"
    draft.missingInformation = list(dict.fromkeys(draft.missingInformation))[:8]
    return draft

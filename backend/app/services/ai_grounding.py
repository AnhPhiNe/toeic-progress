import json
import re
from html import unescape

from app.core.text_input import has_multiple_questions
from app.schemas.models import MistakeDraft


def pasted_source(value: str) -> str:
    """Normalize copy formatting, never parse or execute markup."""
    return unescape(value).replace("**", "").replace("\ufeff", "")


def ground_pasted_draft(source: dict, draft: MistakeDraft, *, image_source: bool, persistent_images: bool) -> MistakeDraft:
    """Check extracted source spans after the single LLM call, without guessing their positions."""
    fields = [" ".join(pasted_source(source.get(name, "")).split()) for name in ("rawText", "context")]
    question = " ".join((draft.question or "").split())
    picture = source["part"] == 1 and image_source
    if picture:
        if question != "Part 1 · Mô tả tranh":
            raise ValueError("AI changed the Part 1 source label")
    elif not question or not any(question in field for field in fields):
        raise ValueError("AI question is not a verbatim source span")
    expected = 3 if source["part"] == 2 else 4
    if len(draft.options) != expected or not all(option.startswith(f"({label}) ") for label, option in zip("ABCD"[:expected], draft.options, strict=True)):
        raise ValueError("AI omitted or relabeled source options")
    for option in draft.options:
        content = " ".join(option[4:].split())
        if not content or not re.search(r"(?<!\w)" + re.escape(content) + r"(?!\w)", fields[0]):
            raise ValueError("AI option is not a verbatim pasted span")
        label = option[1]
        label_pattern = r"(?:^|\s)(?:\(" + label + r"\)|" + label + r"[.):\-])\s*"
        if re.search(label_pattern, fields[0]) and not re.search(label_pattern + re.escape(content) + r"(?!\w)", fields[0]):
            raise ValueError("AI changed a source option label")
    if not image_source and draft.context:
        for paragraph in re.split(r"\n\s*\n", draft.context.strip()):
            if not any(" ".join(paragraph.split()) in field for field in fields):
                raise ValueError("AI context is not a verbatim source span")
    # Reuse the established key/answer contract with the verified extraction.
    canonical = {"question": question, "context": draft.context or ""}
    return ground_draft(json.dumps(canonical), draft, allow_ai_answer=True, source_options=draft.options,
                        source_answer=source.get("sourceAnswer", ""), image_source=image_source,
                        persistent_images=persistent_images)


def normalized(value: str) -> str:
    return " ".join(value.casefold().split())


_QUOTES = str.maketrans({"“": '"', "”": '"', "‘": "'", "’": "'", " ": " "})


def _plain(value: str) -> str:
    return normalized(value.translate(_QUOTES).replace("**", ""))


def ground_evidences(draft: MistakeDraft, passage: str) -> MistakeDraft:
    """Keep only evidence sentences that appear verbatim in the stored passage, so the app can highlight them.

    Quote marks and spacing are ignored; anything else not found in the passage is dropped (never repaired), and blank
    word rows are dropped too. Without a passage (Part 5, kept images) there is nothing to highlight, so none stay.
    """
    if draft.explanation is None:
        return draft
    source = _plain(passage or "")
    kept, seen = [], set()
    for evidence in draft.explanation.evidences:
        text = evidence.text.strip().strip('"“”').strip()
        key = _plain(text)
        if len(key) >= 10 and key in source and key not in seen:
            seen.add(key)
            kept.append(evidence.model_copy(update={"text": text, "translation": evidence.translation.strip(),
                                                    "passageLabel": evidence.passageLabel.strip()}))
    draft.explanation.evidences = kept
    draft.explanation.words = [word for word in draft.explanation.words if word.word.strip() and word.meaning.strip()]
    return draft


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
                 source_options: list[str] | None = None, source_answer: str | None = None,
                 image_source: bool = False, persistent_images: bool = False) -> MistakeDraft:
    """Verify source fields/options; admit labeled AI proposals without claiming a source key."""
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
    # The LLM extracts the stem; this only verifies a verbatim source span, without
    # guessing its location or making a second provider request. Legacy plain-text
    # callers have no isolated question field and keep their compatibility path.
    if source_options is not None:
        try:
            original = json.loads(text)
        except ValueError:
            original = None
        if isinstance(original, dict) and isinstance(original.get("question"), str):
            # New outputs carry the stem explicitly. Splitting remains solely for
            # cached drafts created before the provider contract was extended.
            if draft.question is not None:
                question, context = draft.question, draft.context or ""
            else:
                question, _, context = draft.questionContext.strip().partition("\n")
            question = " ".join(question.split())
            if image_source and question != " ".join(original["question"].split()):
                raise ValueError("AI changed the source question")
            # Check the two source fields independently so that text from learner
            # narration/options or a fabricated span across field boundaries cannot qualify.
            source_fields = [" ".join(original[name].split()) for name in (("question",) if image_source else ("question", "context"))
                             if isinstance(original.get(name), str)]
            if not question and draft.question is not None:
                draft.correctAnswer, draft.answerSource = "", "MISSING"
                draft.missingInformation = list(dict.fromkeys([
                    *draft.missingInformation, "Chưa có câu hỏi riêng. Hãy bổ sung câu hỏi và các phương án từ đề."
                ]))[:8]
            elif not question or not any(question in field for field in source_fields):
                raise ValueError("AI changed the source question")
            if re.match(r"^Questions?\s+\d+.*\brefer\b", question, re.IGNORECASE):
                raise ValueError("AI used a group instruction instead of the question")
            context = "" if persistent_images else re.sub(r"\n[ \t]*(?:\n[ \t]*)+", "\n\n", context.strip())
            separator = "\n\n" if len(question) + len(context) + 2 <= 4000 else "\n"
            draft.questionContext = question + (separator + context if context else "")
            if draft.question is not None:
                draft.question, draft.context = question, context
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
    if image_source:
        if not persistent_images:
            draft.missingInformation.append("Mô tả tranh do AI viết; đối chiếu với tranh trước khi lưu." if draft.part == 1
                                           else "Ngữ cảnh trích từ ảnh; kiểm tra chữ và số trong đoạn đọc trước khi lưu.")
        labels_in_order = []
        for option in options:
            match = re.match(r"^\(([A-D])\)", option, re.IGNORECASE)
            labels_in_order.append(match[1].upper() if match else "")
        if len(options) != 4 or labels_in_order != list("ABCD"):
            draft.correctAnswer, draft.answerSource = "", "MISSING"
            draft.missingInformation = list(dict.fromkeys([
                *draft.missingInformation, "Dán đủ bốn phương án A–D; ảnh chỉ cung cấp ngữ cảnh."
            ]))[:8]
            return draft
    if draft.question == "":
        draft.correctAnswer, draft.answerSource = "", "MISSING"
        draft.missingInformation = list(dict.fromkeys(draft.missingInformation))[:8]
        return draft
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

import re

from app.schemas.models import MistakeDraft


def normalized(value: str) -> str:
    return " ".join(value.casefold().split())


def ground_draft(text: str, draft: MistakeDraft) -> MistakeDraft:
    """Keep extracted options grounded in the source and require an explicit answer key."""
    source = normalized(text)
    options = []
    for option in draft.options:
        content = re.sub(r"^(?:\([A-D]\)|[A-D][.):\s-])\s*", "", option, flags=re.IGNORECASE).strip()
        if content and normalized(content) in source:
            options.append(option)
    if len(options) != len(draft.options):
        draft.missingInformation.append("Đã bỏ phương án không tìm thấy trong nội dung gốc.")
    draft.options = options
    provided = re.search(
        r"(?:đáp án(?:\s+(?:chuẩn|đúng))?|correct answer|answer key|answer)\s*[:=-]\s*([^\n]+)", text, re.IGNORECASE
    )
    answer = normalized(draft.correctAnswer)
    letter = re.match(r"^\(?([a-d])\)?(?:[.):\s]|$)", answer)
    key = normalized(provided.group(1)) if provided else ""
    key_letter = re.match(r"^\(?([a-d])\)?(?:[.):\s]|$)", key)
    supported = bool(answer and key and (answer in key or (letter and key_letter and letter[1] == key_letter[1])))
    if not supported or draft.answerSource == "MISSING":
        draft.answerSource = "MISSING"
        draft.correctAnswer = ""
        draft.missingInformation.append("Đáp án chuẩn chưa được cung cấp hoặc chưa khớp; hãy bổ sung khi chỉnh sửa.")
    draft.missingInformation = list(dict.fromkeys(draft.missingInformation))[:8]
    return draft

from app.schemas.models import MistakeDraft
from app.services.ai_grounding import ground_draft


def draft(**extra):
    return MistakeDraft(
        part=5,
        category="ADVANCED_GRAMMAR",
        questionContext="Reports ____ submitted.",
        userMistake="",
        trapTip="",
        tags=[],
        missingInformation=[],
        **{"correctAnswer": "(B) be", "options": ["(A) are", "(B) be"], "answerSource": "PROVIDED", **extra},
    )


def test_does_not_treat_selected_option_as_the_answer_key():
    result = ground_draft("Reports ____ submitted. (A) are (B) be. Tôi chọn B.", draft())
    assert result.correctAnswer == ""
    assert result.answerSource == "MISSING"


def test_discards_options_not_present_in_source():
    result = ground_draft(
        "Reports ____ submitted. (A) are (B) be. Đáp án chuẩn: B.",
        draft(options=["(A) are", "(B) be", "(C) hallucinated"]),
    )
    assert result.options == ["(A) are", "(B) be"]
    assert result.missingInformation


def test_rejects_answer_that_conflicts_with_explicit_key():
    result = ground_draft("(A) are (B) be. Đáp án chuẩn: A.", draft())
    assert result.correctAnswer == ""

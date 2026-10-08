import pytest

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


def test_ai_proposal_is_allowed_only_in_the_explicit_openai_mode():
    text = "Reports ____ submitted. (A) are (B) be. Tôi chọn A."
    proposed = draft(answerSource="AI_PROPOSED")
    assert ground_draft(text, proposed.model_copy(deep=True)).answerSource == "MISSING"
    result = ground_draft(text, proposed, allow_ai_answer=True)
    assert result.correctAnswer == "(B) be" and result.answerSource == "AI_PROPOSED"
    assert any("AI đề xuất" in warning for warning in result.missingInformation)


def test_an_ai_answer_cannot_be_promoted_to_a_provided_answer_without_a_source():
    result = ground_draft("(A) are (B) be. Tôi chọn B.", draft(), allow_ai_answer=True)
    assert result.correctAnswer == "" and result.answerSource == "MISSING"


def test_source_key_wins_even_if_ai_proposes_another_answer():
    result = ground_draft("(A) are (B) be. Đáp án chuẩn: A vì đây là nguồn của đề.",
                          draft(answerSource="AI_PROPOSED"), allow_ai_answer=True)
    assert result.correctAnswer == "(A) are" and result.answerSource == "PROVIDED"
    assert any("chưa khớp" in warning for warning in result.missingInformation)


def test_invalid_source_key_does_not_fall_back_to_an_ai_guess():
    result = ground_draft("(A) are (B) be. Đáp án chuẩn: D.", draft(answerSource="AI_PROPOSED"), allow_ai_answer=True)
    assert result.correctAnswer == "" and result.answerSource == "MISSING"


def test_proposal_must_match_the_original_label_and_option_text():
    for answer in ("(C) imagined", "(B) are"):
        result = ground_draft("(A) are (B) be.", draft(answerSource="AI_PROPOSED", correctAnswer=answer), allow_ai_answer=True)
        assert result.correctAnswer == "" and result.answerSource == "MISSING"


def test_learner_choice_is_kept_only_when_it_names_a_source_option():
    text = "Reports should ____ submitted. (A) are (B) be. Tôi chọn A. Đáp án chuẩn: B."
    assert ground_draft(text, draft(userChoice="A")).userChoice == "A"
    assert ground_draft(text, draft(userChoice="D")).userChoice == ""


def test_multi_question_grounding_never_uses_the_first_key_for_a_later_question():
    text = "Câu 131:\n(A) daily (B) careful\nAnswer: A\nCâu 132:\n(A) careful (B) carefully\nAnswer: B"
    result = ground_draft(text, draft(options=["(A) careful", "(B) carefully"], correctAnswer="(B) carefully"), allow_ai_answer=True)
    assert result.answerSource == "MISSING" and result.correctAnswer == ""


def test_structured_options_preserve_quoted_text_and_ignore_answer_labels_in_the_reason():
    options = ['(A) "are"', '(B) "be"']
    result = ground_draft('{"userReason":"Answer: A"}', draft(options=options, correctAnswer='(B) "be"'),
                          allow_ai_answer=True, source_options=options, source_answer="B")
    assert result.options == options and result.correctAnswer == options[1] and result.answerSource == "PROVIDED"


def test_structured_input_does_not_silently_drop_source_options():
    with pytest.raises(ValueError, match="source options"):
        ground_draft('{"question":"Reports ____ submitted"}', draft(), allow_ai_answer=True,
                     source_options=['(A) are', '(B) be', '(C) were'], source_answer='B')

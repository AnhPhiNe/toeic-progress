import json

import pytest

from app.schemas.models import MistakeDraft
from app.services.ai_grounding import ground_draft


def draft(**extra):
    return MistakeDraft(
        **{"part": 5, "category": "ADVANCED_GRAMMAR", "questionContext": "Reports ____ submitted.",
           "userMistake": "", "trapTip": "", "tags": [], "missingInformation": [],
           "correctAnswer": "(B) be", "options": ["(A) are", "(B) be"], "answerSource": "PROVIDED", **extra},
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


def test_listening_question_extraction_preserves_source_wording_and_existing_answer_rules():
    question = "What problem does the man mention?"
    transcript = "(M-Cn) The warehouse was out of the small food containers.\n(W-Am) Sales are slow today."
    options = ["(A) Sales are slow.", "(B) An order is incomplete."]
    text = json.dumps({"question": "Questions 53 through 55 refer to the following conversation.\n"
                      + transcript + "\n\nWhat problem does the\nman mention?", "context": ""})
    result = ground_draft(text, draft(part=3, questionContext=question + "\n\n\n\n" + transcript,
                                     options=options, correctAnswer=options[1], answerSource="AI_PROPOSED",
                                     userChoice="A"),
                          allow_ai_answer=True, source_options=options, source_answer="")
    assert result.questionContext == question + "\n\n" + transcript
    assert result.options == options and result.userChoice == "A"
    assert result.correctAnswer == options[1] and result.answerSource == "AI_PROPOSED"
    assert ground_draft(text, result, allow_ai_answer=True, source_options=options,
                        source_answer="A").correctAnswer == options[0]


@pytest.mark.parametrize("extracted", [
    "What issue does the man mention?",  # paraphrase
    "What problem does the man mention!",  # punctuation changed
    "what problem does the man mention?",  # case changed
    "Câu hỏi: What problem does the man mention?",  # generated prefix
    "Questions 53 through 55 refer to the following conversation.",  # group instruction
    "Invented learner question?",  # found only in learner narration, not the source
])
def test_structured_question_must_be_verbatim_and_cannot_use_the_group_instruction(extracted):
    text = json.dumps({"question": "Questions 53 through 55 refer to the following conversation.\n"
                      "What problem does the man mention?", "context": "", "userReason": "Invented learner question?"})
    with pytest.raises(ValueError, match="source question|group instruction"):
        ground_draft(text, draft(part=3, questionContext=extracted), allow_ai_answer=True,
                     source_options=["(A) are", "(B) be"], source_answer="B")


def test_reading_extraction_keeps_the_blank_instead_of_filling_the_correct_answer():
    text = json.dumps({"question": "Reports ____ submitted.", "context": "The office closes today."})
    result = ground_draft(text, draft(), allow_ai_answer=True,
                          source_options=["(A) are", "(B) be"], source_answer="B")
    assert result.questionContext == "Reports ____ submitted."
    with pytest.raises(ValueError, match="source question"):
        ground_draft(text, draft(questionContext="Reports be submitted."), allow_ai_answer=True,
                     source_options=["(A) are", "(B) be"], source_answer="B")


def test_explicit_stem_is_verified_without_consulting_the_first_line_of_legacy_text():
    question = "What problem does the man mention?"
    context = "(M-Cn) Our order was incomplete."
    source = json.dumps({"question": context + "\n" + question, "context": ""})
    result = ground_draft(source, draft(part=3, question=question, context=context,
                                      questionContext="A stale legacy heading"),
                          allow_ai_answer=True, source_options=["(A) are", "(B) be"], source_answer="B")
    assert result.question == question and result.context == context
    assert result.questionContext == question + "\n\n" + context
    with pytest.raises(ValueError, match="source question"):
        ground_draft(source, draft(question="Invented heading", context=context),
                     allow_ai_answer=True, source_options=["(A) are", "(B) be"], source_answer="B")


def test_transcript_without_a_question_cannot_receive_a_provided_or_proposed_answer():
    context = "(W-Br) Will you have to relocate, or can you work from home?"
    source = json.dumps({"question": context, "context": ""})
    result = ground_draft(source, draft(part=3, question="", context=context),
                          allow_ai_answer=True, source_options=["(A) are", "(B) be"], source_answer="B")
    assert result.question == "" and result.context == context
    assert result.correctAnswer == "" and result.answerSource == "MISSING"
    assert any("câu hỏi riêng" in warning for warning in result.missingInformation)


@pytest.mark.parametrize("source_field", ["question", "context"])
def test_extraction_accepts_a_stem_anywhere_in_either_source_field_and_keeps_full_reference(source_field):
    question = "What is the purpose of the revised schedule?"
    # Decisive information can be far from the stem; grounding must not clip to
    # a fixed number of neighboring sentences or require a first-line position.
    reference = (
        "The schedule was revised to accommodate the training session.\n"
        "The staff will arrive at nine.\nThe office opens at eight.\n"
        "Lunch is served at noon.\nThe meeting room is upstairs.\n"
        "All employees have received a copy."
    )
    fields = {"question": "Source material", "context": ""}
    fields[source_field] = reference + "\n\n" + question
    result = ground_draft(json.dumps(fields), draft(question=question, context=reference),
                          allow_ai_answer=True, source_options=["(A) are", "(B) be"], source_answer="B")
    assert result.question == question and result.context == reference
    assert result.correctAnswer == "(B) be" and result.answerSource == "PROVIDED"


def test_a_generated_stem_cannot_be_constructed_across_source_field_boundaries():
    source = json.dumps({"question": "What problem does", "context": "the man mention?"})
    with pytest.raises(ValueError, match="source question"):
        ground_draft(source, draft(question="What problem does the man mention?", context=""),
                     allow_ai_answer=True, source_options=["(A) are", "(B) be"], source_answer="B")


def test_context_images_preserve_pasted_options_but_missing_choices_do_not_get_an_answer():
    options = ["(A) Cancel a meeting.", "(B) Send a document.", "(C) Book a room.", "(D) Call a colleague."]
    source = json.dumps({"question": "What should employees do?", "context": ""})
    result = ground_draft(source, draft(part=7, question="What should employees do?", context="Send the document.",
        options=options, correctAnswer=options[1], answerSource="AI_PROPOSED"),
        allow_ai_answer=True, source_options=options, source_answer="", image_source=True)
    assert result.options == options and result.correctAnswer == options[1]
    assert any("trích từ ảnh" in warning for warning in result.missingInformation)
    incomplete = ground_draft(source, draft(part=7, question="What should employees do?", context="Send the document.",
        options=options[:3], correctAnswer=options[1], answerSource="AI_PROPOSED"),
        allow_ai_answer=True, source_answer="B", image_source=True)
    assert incomplete.correctAnswer == "" and incomplete.answerSource == "MISSING"


def test_images_do_not_permit_changes_to_options_already_entered_as_text():
    with pytest.raises(ValueError, match="source options"):
        ground_draft('{"question":"Q","context":""}', draft(options=["(A) invented", "(B) be"]),
                     source_options=["(A) are", "(B) be"], image_source=True)


def test_context_images_cannot_override_the_pasted_stem_even_with_valid_image_context():
    options = ["(A) Call.", "(B) Write.", "(C) Wait.", "(D) Leave."]
    source = json.dumps({"question": "What should employees do?", "context": "A different question?"})
    with pytest.raises(ValueError, match="source question"):
        ground_draft(source, draft(part=7, question="A different question?", context="A real passage.", options=options),
                     source_options=options, source_answer="", image_source=True)

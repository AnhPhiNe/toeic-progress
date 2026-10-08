import pytest

from app.core.text_input import has_multiple_questions
from app.schemas.models import ExtractRequest, MistakeInput


@pytest.mark.parametrize("text", [
    "101. Reports ____ submitted.\n(A) are\n(B) be\n102. Orders ____ yesterday.\n(A) shipped\n(B) shipping",
    "131) First question\n132) Second question",
    "First question (A) alpha (B) beta\nSecond question (A) gamma (B) delta",
])
def test_numbered_questions_or_repeated_option_groups_are_rejected(text):
    assert has_multiple_questions(text)
    with pytest.raises(ValueError):
        ExtractRequest(text=text, request_id="22222222-2222-4222-8222-222222222222", consent=True)
    with pytest.raises(ValueError):
        MistakeInput(question=text, options=['(A) are', '(B) be'], userChoiceState='UNKNOWN')


def test_numbered_paragraph_lists_and_numbers_in_prose_are_not_question_groups():
    for text in ["1. Deliveries arrive at noon.\n2. Returns close at 5 PM.",
                 "The office at 101 Main Street serves 102 customers.\nWhat is stated about the office?",
                 "101. Reports ____ submitted.\n(A) are\n(B) be"]:
        assert not has_multiple_questions(text)

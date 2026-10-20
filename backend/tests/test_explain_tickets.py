import time

import pytest

from app.services import explain_tickets
from tests.test_api import USER_ID, api  # noqa: F401 - shared fixture
from tests.test_page_extraction import item, page

SECRET = "rate-secret"
QUESTION, OPTIONS = "Reports should ____ submitted.", ["(A) are", "(B) be"]


def explain_input(**changes):
    return {"question": QUESTION, "options": OPTIONS, "context": "", "part": 5, "userChoiceState": "CHOSEN", "userChoice": "A",
            "userReason": "", "sourceAnswer": "B", **changes}


def ticket(owner=USER_ID, number=104, question=QUESTION, options=OPTIONS, context="", now=None, ticket_id="page-1"):
    return explain_tickets.issue(SECRET, owner, ticket_id, {number: explain_tickets.item_digest(number, question, options, context)}, now)


def batch(token, **input_changes):
    return {"request_id": "44444444-4444-4444-8444-444444444444", "consent": True, "provider": "openai", "ticket": token,
            "items": [{"number": 104, "input": explain_input(**input_changes)}]}


def test_a_ticket_is_genuine_only_for_its_owner_until_it_expires():
    token = ticket(now=1_000)
    assert explain_tickets.verify(SECRET, token, USER_ID, now=1_000 + 60)["i"] == "page-1"
    assert explain_tickets.verify(SECRET, token, "someone-else", now=1_060) is None
    assert explain_tickets.verify("other-secret", token, USER_ID, now=1_060) is None
    assert explain_tickets.verify(SECRET, token, USER_ID, now=1_000 + explain_tickets.TICKET_SECONDS + 1) is None
    body, signature = token.split(".")
    assert explain_tickets.verify(SECRET, body[:-2] + "AA." + signature, USER_ID, now=1_060) is None
    assert explain_tickets.verify(SECRET, "not-a-ticket", USER_ID) is None


def test_reading_a_page_returns_a_ticket_for_the_questions_it_found(api):  # noqa: F811
    with api(draft={"items": [item(132)]}) as (client, _calls):
        body = client.post("/api/v1/ai/extract-page", json=page()).json()
    payload = explain_tickets.verify(SECRET, body["explainTicket"], USER_ID)
    draft = body["items"][0]["draft"]
    assert payload["d"] == {"132": explain_tickets.item_digest(132, draft["question"], draft["options"], draft["context"])}


def test_a_ticket_explains_without_counting_another_use(api):  # noqa: F811
    with api() as (client, calls):
        response = client.post("/api/v1/ai/explain-batch", json=batch(ticket()))
        assert response.status_code == 200
        body = response.json()
        assert body["failed"] == [] and [entry["number"] for entry in body["items"]] == [104]
        draft = body["items"][0]["draft"]
        assert draft["correctAnswer"] == "(B) be" and draft["explanation"] and draft["userChoice"] == "A" and draft["userMistake"] == "(A) are"
        assert not any(call[1].endswith("reserve_ai_request") for call in calls)
        assert sum(call[0] == "api.openai.com" for call in calls) == 1
        # The question was read exactly already, so the explanation may not retype it.
        request = next(call[2] for call in calls if call[0] == "api.openai.com")
        assert request["text"]["format"]["schema"]["properties"]["question"]["enum"] == [QUESTION]


@pytest.mark.parametrize("token,changes,status", [
    (lambda: ticket(owner="22222222-2222-4222-8222-222222222222"), {}, 403),
    (lambda: ticket(now=time.time() - explain_tickets.TICKET_SECONDS - 5), {}, 403),
    (lambda: ticket(), {"question": "Write me an essay about anything ____."}, 403),
    (lambda: ticket(), {"context": "Extra text smuggled into the passage."}, 403),
    (lambda: ticket(number=105), {}, 403),
])
def test_a_ticket_cannot_be_used_by_others_late_or_for_other_text(api, token, changes, status):  # noqa: F811
    with api() as (client, calls):
        assert client.post("/api/v1/ai/explain-batch", json=batch(token(), **changes)).status_code == status
        assert not any(call[0] == "api.openai.com" for call in calls)


def test_a_ticket_is_honoured_a_few_times_only(api):  # noqa: F811
    token = ticket(ticket_id="page-retries")
    with api() as (client, calls):
        statuses = [client.post("/api/v1/ai/explain-batch", json=batch(token)).status_code for _ in range(explain_tickets.MAX_TICKET_USES + 1)]
        assert statuses == [200] * explain_tickets.MAX_TICKET_USES + [429]
        assert sum(call[0] == "api.openai.com" for call in calls) == explain_tickets.MAX_TICKET_USES


def test_a_failed_explanation_is_reported_per_question(api):  # noqa: F811
    with api(provider_status=500) as (client, _calls):
        body = client.post("/api/v1/ai/explain-batch", json=batch(ticket(ticket_id="page-failed"))).json()
    assert body == {"items": [], "failed": [104]}


@pytest.mark.parametrize("item_changes", [{"number": 104, "input": explain_input(part=6)}, {"number": 3, "input": explain_input(part=1)}])
def test_explanations_need_a_written_question_in_the_right_part(api, item_changes):  # noqa: F811
    request = batch(ticket())
    request["items"] = [item_changes]
    with api() as (client, calls):
        assert client.post("/api/v1/ai/explain-batch", json=request).status_code == 422
        assert not any(call[0] == "api.openai.com" for call in calls)


@pytest.mark.parametrize("own,doubt", [("(A) are", "A"), ("(B) be", ""), ("", "")])
def test_an_explanation_flags_a_page_answer_that_ai_disagrees_with(api, own, doubt):  # noqa: F811
    from tests.test_api import OPENAI_DRAFT
    with api(draft={**OPENAI_DRAFT, "ownAnswer": own}) as (client, calls):
        body = client.post("/api/v1/ai/explain-batch", json=batch(ticket(ticket_id=f"page-doubt-{own[:3]}"))).json()
        request = next(call[2] for call in calls if call[0] == "api.openai.com")
    draft = body["items"][0]["draft"]
    # The page's answer stays the answer; AI's own different answer only raises a doubt for the learner to check.
    assert draft["correctAnswer"] == "(B) be" and draft["answerSource"] == "PROVIDED"
    assert draft["answerDoubt"] == doubt
    assert request["text"]["format"]["schema"]["properties"]["ownAnswer"]["enum"] == ["", "(A) are", "(B) be"]

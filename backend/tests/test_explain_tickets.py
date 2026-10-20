import asyncio
import time
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.services import explain_tickets
from tests.explanation_ledger_mock import ExplanationLedgerMock
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
    precise = ticket(now=1000.375)
    assert explain_tickets.verify(SECRET, precise, USER_ID, now=1000.5)["e"] == 1000.375 + explain_tickets.TICKET_SECONDS


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


def test_successful_explanations_are_cached_without_spending_more_calls(api):  # noqa: F811
    token = ticket(ticket_id="page-retries")
    with api() as (client, calls):
        statuses = [client.post("/api/v1/ai/explain-batch", json=batch(token)).status_code for _ in range(explain_tickets.MAX_TICKET_USES + 1)]
        assert statuses == [200] * (explain_tickets.MAX_TICKET_USES + 1)
        assert sum(call[0] == "api.openai.com" for call in calls) == 1


def test_a_failed_explanation_is_reported_per_question(api):  # noqa: F811
    with api(provider_status=500) as (client, _calls):
        body = client.post("/api/v1/ai/explain-batch", json=batch(ticket(ticket_id="page-failed"))).json()
    assert body == {"items": [], "failed": [104], "retry": [{"number": 104, "status": "retryable", "remainingAttempts": 2}]}


def test_an_empty_explanation_is_retryable_instead_of_cached_as_completed(api):  # noqa: F811
    from tests.test_api import OPENAI_DRAFT

    incomplete = {**OPENAI_DRAFT, "explanation": {**OPENAI_DRAFT["explanation"], "quickTip": " "}}
    with api(draft=incomplete) as (client, _calls):
        body = client.post("/api/v1/ai/explain-batch", json=batch(ticket(ticket_id="empty-explanation"))).json()
    assert body["items"] == [] and body["failed"] == [104]
    assert body["retry"] == [{"number": 104, "status": "retryable", "remainingAttempts": 2}]


def test_failures_are_idempotent_and_each_question_has_its_own_attempt_budget(api):  # noqa: F811
    token = ticket(ticket_id="failed-once")
    with api(provider_status=500) as (client, calls):
        request = batch(token)
        for _ in range(4):
            response = client.post("/api/v1/ai/explain-batch", json=request)
            assert response.status_code == 200
            assert response.json()["retry"][0]["remainingAttempts"] == 2
        assert sum(call[0] == "api.openai.com" for call in calls) == 1
        for remaining in (1, 0, 0):
            request["request_id"] = str(uuid4())
            response = client.post("/api/v1/ai/explain-batch", json=request)
            state = response.json()["retry"][0]
            assert state["remainingAttempts"] == remaining
            assert state["status"] == ("exhausted" if remaining == 0 else "retryable")
        assert sum(call[0] == "api.openai.com" for call in calls) == 3


def test_six_failed_questions_can_each_retry_successfully(api, monkeypatch):  # noqa: F811
    numbers = list(range(104, 110))
    token = explain_tickets.issue(SECRET, USER_ID, "six-questions", {
        number: explain_tickets.item_digest(number, QUESTION, OPTIONS, "") for number in numbers
    })
    request = batch(token)
    request["items"] = [{"number": number, "input": explain_input()} for number in numbers]
    with api() as (client, calls):
        original = client.app.state.gateway.generate
        attempts = 0

        async def fail_first_batch(*args, **kwargs):
            nonlocal attempts
            attempts += 1
            if attempts <= 6:
                raise HTTPException(502, "Temporary provider failure")
            return await original(*args, **kwargs)

        monkeypatch.setattr(client.app.state.gateway, "generate", fail_first_batch)
        initial = client.post("/api/v1/ai/explain-batch", json=request).json()
        assert initial["failed"] == numbers
        assert all(state["remainingAttempts"] == 2 for state in initial["retry"])
        for number in numbers:
            retry = {**request, "request_id": str(uuid4()), "items": [{"number": number, "input": explain_input()}]}
            body = client.post("/api/v1/ai/explain-batch", json=retry).json()
            assert body["failed"] == []
            assert body["retry"] == [{"number": number, "status": "completed", "remainingAttempts": 1}]
            # New request IDs do not regenerate a successful question.
            replay = client.post("/api/v1/ai/explain-batch", json={**retry, "request_id": str(uuid4())}).json()
            assert replay == body
        assert attempts == 12
        assert sum(call[0] == "api.openai.com" for call in calls) == 6


def test_concurrent_requests_share_one_generation_and_failures_can_retry():
    async def scenario():
        ledger = explain_tickets.TicketUses(ExplanationLedgerMock().rpc)
        started, release = asyncio.Event(), asyncio.Event()
        calls = 0

        async def generate():
            nonlocal calls
            calls += 1
            started.set()
            await release.wait()
            return None

        async def run(request_id):
            return await ledger.run(USER_ID, "concurrent", 104, int(time.time()) + 60, request_id, "same-input", generate)

        first = asyncio.create_task(run("request-a"))
        await started.wait()
        second = asyncio.create_task(run("request-b"))
        await asyncio.sleep(0)
        release.set()
        a, b = await asyncio.gather(first, second)
        assert a == b and a["remainingAttempts"] == 2 and calls == 1
        assert await run("request-a") == a
        assert await run("request-b") == a
        assert calls == 1
        await run("request-c")
        assert calls == 2

    asyncio.run(scenario())


def test_success_cache_cannot_be_reused_for_changed_learner_metadata(api):  # noqa: F811
    with api() as (client, calls):
        token = ticket(ticket_id="bound-learner")
        assert client.post("/api/v1/ai/explain-batch", json=batch(token)).status_code == 200
        response = client.post("/api/v1/ai/explain-batch", json=batch(token, sourceAnswer="A"))
        assert response.status_code == 403
        assert response.headers["X-Error-Code"] == "EXPLAIN_TICKET_CONTENT_CHANGED"
        assert sum(call[0] == "api.openai.com" for call in calls) == 1


def test_durable_cache_survives_a_new_backend_worker(api):  # noqa: F811
    ledger = ExplanationLedgerMock()
    token = ticket(ticket_id="across-workers")
    with api(ledger_mock=ledger) as (first, calls):
        draft = first.post("/api/v1/ai/explain-batch", json=batch(token)).json()
        assert sum(call[0] == "api.openai.com" for call in calls) == 1
    with api(ledger_mock=ledger) as (second, calls):
        assert second.post("/api/v1/ai/explain-batch", json=batch(token)).json() == draft
        assert not any(call[0] == "api.openai.com" for call in calls)


def test_ledger_unavailable_fails_closed_and_readiness_reports_missing_migration(api):  # noqa: F811
    with api(ledger_status=503) as (client, calls):
        assert client.get("/ready").status_code == 503
        response = client.post("/api/v1/ai/explain-batch", json=batch(ticket(ticket_id="ledger-down")))
        assert response.status_code == 503
        assert not any(call[0] == "api.openai.com" for call in calls)


def test_failed_completion_write_never_dispatches_the_same_attempt_again():
    async def scenario():
        persisted = ExplanationLedgerMock()
        calls = 0

        async def rpc(name, parameters):
            if name == "finish_explanation_question":
                raise HTTPException(503, "Database disconnected after generation")
            return persisted.respond(name, parameters)

        async def generate():
            nonlocal calls
            calls += 1
            return {"question": QUESTION}

        async def run(worker):
            return await worker.run(USER_ID, "uncertain-attempt", 104, int(time.time()) + 60, "same-request", "binding", generate)

        with pytest.raises(HTTPException):
            await run(explain_tickets.TicketUses(rpc))
        result = await run(explain_tickets.TicketUses(rpc))
        assert result["status"] == "retryable" and result["draft"] is None
        assert calls == 1

    asyncio.run(scenario())


def test_ticket_followup_retains_the_full_source_context_without_changing_single_extract_limits(api):  # noqa: F811
    from pydantic import ValidationError

    from app.schemas.models import MistakeInput, PageExplanationInput

    context = ("Delivery information. " * 228) + "Final evidence: the delivery fee is $19."
    token = ticket(context=context, ticket_id="long-source")
    with api() as (client, calls):
        response = client.post("/api/v1/ai/explain-batch", json=batch(token, context=context))
        assert response.status_code == 200
        draft = response.json()["items"][0]["draft"]
        assert draft["context"] == context
        assert draft["questionContext"] == QUESTION + "\n\n" + context
        provider_request = next(call[2] for call in calls if call[0] == "api.openai.com")
        assert provider_request["text"]["format"]["schema"]["properties"]["context"]["enum"] == [""]
    large_input = explain_input(context="a" * 8000)
    assert PageExplanationInput.model_validate(large_input).context == "a" * 8000
    escaped_source = explain_input(question="x" * 4000, context="x\n" * 4000,
                                   options=["(A) " + "a" * 996, "(B) " + "b" * 996])
    assert PageExplanationInput.model_validate(escaped_source).context == escaped_source["context"]
    with pytest.raises(ValidationError):
        MistakeInput.model_validate(large_input)


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

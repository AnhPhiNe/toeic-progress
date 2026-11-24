"""Provider budget weights, the free daily cap, and that a budget refusal never spends an AI use or ticket attempt."""

from app.core.config import Settings
from app.integrations.openai_provider import explanation_cost, model_cost
from tests.batch_reservation_mock import BatchReservationMock
from tests.test_api import USER_ID, api, extraction  # noqa: F401 - shared fixture
from tests.test_page_extraction import PASSAGE, item, page

BUDGETED = {"ai_provider_budget_enabled": True}
EXPLAIN_REQUEST = "44444444-4444-4444-8444-444444444444"


def explain_body(ticket, request_id=EXPLAIN_REQUEST):
    return {
        "request_id": request_id, "consent": True, "provider": "openai", "ticket": ticket,
        "items": [{"number": 131, "input": {
            "part": 6, "question": item(131)["question"], "context": PASSAGE, "options": item(131)["options"],
            "userChoiceState": "CHOSEN", "userChoice": "B", "sourceAnswer": "D",
        }}],
    }


def paths(calls, suffix):
    return [call for call in calls if call[1].endswith(suffix)]


def test_explanation_weights_part5_6_one_unit_part7_and_part1_two():
    assert explanation_cost(5) == 1 and explanation_cost(6) == 1 and explanation_cost(None) == 1
    assert explanation_cost(7) == 2 and explanation_cost(1) == 2
    assert explanation_cost(6, has_images=True) == 2
    assert explanation_cost(True) == 1  # a bool is not a Part


def test_page_read_weights_are_model_based():
    assert model_cost("gpt-6-luna", "low", 1) == 1
    assert model_cost("gpt-6.1-terra", "low", 1) == 2
    assert model_cost("gpt-6.1-terra", "medium", 1) == 3
    assert model_cost("gpt-6-luna", "low", 4) == 2
    assert model_cost("gpt-6.1-terra", "high", 8) == 4


def test_free_owner_daily_cap_is_60_units():
    assert Settings(_env_file=None).ai_provider_owner_day_limit_free == 60


def test_page_explanation_is_charged_one_unit_for_part6(api):  # noqa: F811
    with api(draft={"items": [item(131)]}, settings_overrides=BUDGETED) as (client, calls):
        ticket = client.post("/api/v1/ai/extract-page", json=page()).json()["explainTicket"]
        assert client.post("/api/v1/ai/explain-batch", json=explain_body(ticket)).status_code == 200
        budget = [call[2]["p_cost"] for call in paths(calls, "/reserve_provider_budget")]
        assert budget == [1, 1] and paths(calls, "/reserve_provider_budget")[0][2]["p_owner_limit"] == 60


def test_budget_refusal_does_not_spend_the_ai_use(api):  # noqa: F811
    refused = {"allowed": False, "code": "owner_day", "retry_after": 3600}
    with api(provider_budget=refused, settings_overrides=BUDGETED) as (client, calls):
        response = client.post("/api/v1/ai/extract-page", json=page(batch_id="55555555-5555-4555-8555-555555555555"))
        assert response.status_code == 429
        assert "hết lượt AI" in response.json()["detail"] and "chưa bị trừ" in response.json()["detail"]
        assert response.headers["X-Error-Code"] == "AI_PROVIDER_BUDGET"
        assert not paths(calls, "/reserve_ai_batch_request") and not paths(calls, "/reserve_ai_request")
        assert not any(call[0] == "api.openai.com" for call in calls)

        single = client.post("/api/v1/ai/extract", json=extraction())
        assert single.status_code == 429 and not paths(calls, "/reserve_ai_request")


def test_budget_refusal_in_explain_batch_keeps_every_ticket_attempt(api):  # noqa: F811
    state = {"refuse": False}

    def budget(_body):
        return {"allowed": False, "code": "owner_day", "retry_after": 3600} if state["refuse"] else {"allowed": True}

    with api(draft={"items": [item(131)]}, provider_budget=budget, settings_overrides=BUDGETED) as (client, calls):
        ticket = client.post("/api/v1/ai/extract-page", json=page()).json()["explainTicket"]
        state["refuse"] = True
        blocked = client.post("/api/v1/ai/explain-batch", json=explain_body(ticket))
        assert blocked.status_code == 429 and "hết lượt AI" in blocked.json()["detail"]
        assert not paths(calls, "/claim_explanation_question")
        state["refuse"] = False
        result = client.post("/api/v1/ai/explain-batch", json=explain_body(ticket, "77777777-7777-4777-8777-777777777778"))
        assert result.status_code == 200
        # The first real attempt: two retries are still left, nothing was burned by the refusal.
        assert len(paths(calls, "/claim_explanation_question")) == 1
        assert result.json()["retry"][0]["remainingAttempts"] == 2


def test_page_returns_only_the_ticketed_numbers_when_the_capture_explain_cap_is_reached(api):  # noqa: F811
    batch = "55555555-5555-4555-8555-555555555555"
    batches = BatchReservationMock()
    batches.batch_explain_questions[(USER_ID, batch)] = 15  # one explanation left in this capture
    with api(draft={"items": [item(131), item(132)]}, batch_mock=batches) as (client, _calls):
        body = client.post("/api/v1/ai/extract-page", json=page(batch_id=batch)).json()
        assert [entry["number"] for entry in body["items"]] == [131, 132]
        assert body["explainNumbers"] == [131] and body["explainLimit"] == 16
        # The ticket stays strict: a number outside it is refused.
        refused = explain_body(body["explainTicket"])
        refused["items"][0]["number"] = 132
        refused["items"][0]["input"]["question"] = item(132)["question"]
        assert client.post("/api/v1/ai/explain-batch", json=refused).status_code == 403


def test_exhausted_user_does_not_burn_global_provider_budget(api):  # noqa: F811
    with api(
        settings_overrides=BUDGETED,
        quota_counters={"user:": 10},
    ) as (client, calls):
        res = client.post("/api/v1/ai/extract", json=extraction())
        assert res.status_code == 429
        assert not paths(calls, "/reserve_provider_budget")
        assert not any(call[0] == "api.openai.com" for call in calls)


def test_replaying_settled_explain_batch_does_not_re_spend_provider_budget(api):  # noqa: F811
    explained = {
        "part": 6, "category": "ADVANCED_GRAMMAR",
        "question": item(131)["question"], "context": "",
        "userMistake": "(B) largeness", "correctAnswer": "(D) largely",
        "options": item(131)["options"], "tags": [], "missingInformation": [],
        "answerSource": "PROVIDED", "userChoice": "B", "ownAnswer": "(D) largely",
        "optionNotes": [
            {"label": label, "pos": "adj" if label != "D" else "adv", "meaning": label, "reason": ""}
            for label in "ABCD"
        ],
        "explanation": {
            "quickTip": "Trạng từ bổ nghĩa cho phân từ.", "translation": "", "questionType": "Từ loại",
            "evidence": "", "paraphrase": "", "analysis": "Trạng từ đứng trước financed.",
            "keyVocabulary": "", "evidences": [], "words": [],
        },
    }
    with api(drafts=[{"items": [item(131)]}, explained], settings_overrides=BUDGETED) as (client, calls):
        ticket = client.post("/api/v1/ai/extract-page", json=page()).json()["explainTicket"]
        first = client.post("/api/v1/ai/explain-batch", json=explain_body(ticket))
        assert first.status_code == 200 and first.json()["items"]
        before = len(paths(calls, "/reserve_provider_budget"))
        # Replaying the exact settled ticket item must skip prepay_provider_budget completely.
        replay = client.post("/api/v1/ai/explain-batch", json=explain_body(ticket, "88888888-8888-4888-8888-888888888888"))
        assert replay.status_code == 200
        assert len(paths(calls, "/reserve_provider_budget")) == before

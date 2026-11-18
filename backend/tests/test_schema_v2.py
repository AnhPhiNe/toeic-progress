"""Backend behaviour that depends on the v2 database baseline."""

import asyncio

from test_api import USER_ID
from test_api import api as api  # Register the shared pytest fixture.

from app.commands import maintenance


def record(entity_type, record_id, payload):
    return {"entity_type": entity_type, "record_id": record_id, "payload": {"id": record_id, **payload},
            "updated_at": "2026-11-17T00:00:00Z", "deleted_at": None}


def test_older_apps_may_still_send_retired_weekly_plans_and_checklist(api):
    records = [record("checklist", "exam_slip", {"checked": "not even a boolean"}),
               record("weeklyPlans", "2026-11-16", {"weekKey": "2026-11-16", "tasks": "anything"}),
               {**record("checklist", "old", {}), "deleted_at": "2026-11-17T00:00:00Z"},
               record("vocabLog", "v1", {"date": "2026-11-19", "count": 3})]
    with api() as (client, calls):
        reply = client.post("/api/v1/sync", json={"records": records, "cursor": 0})
        assert reply.status_code == 200, reply.text
        sent = next(call[2] for call in calls if call[1].endswith("/sync_account_records"))
        assert sent["p_user_id"] == USER_ID
        assert [row["entity_type"] for row in sent["p_records"]] == ["vocabLog"]
        # Duplicates are still refused, retired or not.
        assert client.post("/api/v1/sync", json={"records": [records[0], records[0]]}).status_code == 422


def test_readiness_is_one_schema_probe(api):
    with api() as (client, calls):
        assert client.get("/ready").status_code == 200
        assert [call[1] for call in calls] == ["/rest/v1/rpc/schema_ready"]


class FakeGateway:
    def __init__(self, rounds):
        self.rounds, self.calls = rounds, []

    async def rpc(self, name, parameters):
        self.calls.append((name, parameters))
        return self.rounds[len(self.calls) - 1]


def test_maintenance_repeats_only_while_a_step_fills_its_batch():
    full = {"aiUsageCounters": maintenance.BATCH, "aiRequests": 3, "aiBatches": 0, "apiRateLimits": 1,
            "explanationQuestions": 0, "leagueWeeks": 1, "limit": maintenance.BATCH}
    rest = {**{key: 0 for key in full}, "aiUsageCounters": 7, "limit": maintenance.BATCH}
    gateway = FakeGateway([full, rest])
    totals = asyncio.run(maintenance.run(gateway))
    assert [name for name, _ in gateway.calls] == ["run_maintenance", "run_maintenance"]
    assert gateway.calls[0][1] == {"p_limit": maintenance.BATCH, "p_league_weeks": 12}
    assert totals["aiUsageCounters"] == maintenance.BATCH + 7 and totals["leagueWeeks"] == 1 and "limit" not in totals

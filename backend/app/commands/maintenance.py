"""Daily database cleanup. Run from backend/: python -m app.commands.maintenance

Calls public.run_maintenance (service role only), which deletes in bounded
batches: expired AI usage counters, AI request hashes older than 30 days, AI
batches and API rate-limit windows older than a day, expired explanation
tickets without an active lease, and league history older than 12 weeks.
Then finishes stuck account deletions: accounts whose delete failed after the
ban and whose unban also failed keep a private pending row; those older than
PENDING_GRACE_SECONDS are purged and deleted with the same code path as the API.
Scheduled daily by .github/workflows/maintenance.yml.
"""

import asyncio
import json
import logging

import httpx
from fastapi import HTTPException

from app.core.config import Settings
from app.integrations.gateway import AccountDeletionError, Gateway

BATCH = 5000
MAX_ROUNDS = 20
PENDING_GRACE_SECONDS = 600
PENDING_BATCH = 50

logger = logging.getLogger("toeic.maintenance")


async def run(gateway: Gateway) -> dict:
    totals: dict[str, int] = {}
    for _ in range(MAX_ROUNDS):
        result = await gateway.rpc("run_maintenance", {"p_limit": BATCH, "p_league_weeks": 12})
        steps = {key: value for key, value in result.items() if key != "limit"}
        for key, value in steps.items():
            totals[key] = totals.get(key, 0) + value
        # A step that filled its batch may have more to delete.
        if all(value < BATCH for value in steps.values()):
            break
    return totals


async def finish_pending_deletions(gateway: Gateway) -> dict:
    """Finish deletions left pending (banned, not deleted). Returns {"finished": n, "failed": m}."""
    pending = await gateway.rpc("list_pending_account_deletions",
                                {"p_older_than_seconds": PENDING_GRACE_SECONDS, "p_limit": PENDING_BATCH}) or []
    finished = failed = 0
    for row in pending:
        user_id = row["userId"]
        try:
            await gateway.finish_account_deletion(user_id)
        except AccountDeletionError as error:
            failed += 1
            note = f"{error.step}:{error.status}" if error.status else error.step
            try:
                await gateway.rpc("note_account_deletion_attempt", {"p_user_id": user_id, "p_error": note})
            except (HTTPException, httpx.HTTPError, ValueError, TypeError):
                pass
            logger.warning(json.dumps({"event": "pending_delete_failed", "step": error.step, "status": error.status,
                                       "attempts": row.get("attempts", 0) + 1}))
            continue
        finished += 1
        logger.info(json.dumps({"event": "pending_delete_finished", "attempts": row.get("attempts", 0) + 1}))
    return {"finished": finished, "failed": failed}


async def main():
    settings = Settings()
    if not settings.database_ready:
        raise SystemExit("Configure Supabase before running maintenance.")
    async with httpx.AsyncClient(timeout=30) as client:
        gateway = Gateway(settings, client)
        totals = await run(gateway)
        print("Maintenance removed: " + json.dumps(totals, sort_keys=True))
        deletions = await finish_pending_deletions(gateway)
    print("Pending account deletions: " + json.dumps(deletions, sort_keys=True))
    if deletions["failed"]:
        # Fail the scheduled job so a stuck account is noticed; the next run retries.
        raise SystemExit(1)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    asyncio.run(main())

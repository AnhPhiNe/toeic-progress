"""Daily database cleanup. Run from backend/: python -m app.commands.maintenance

Calls public.run_maintenance (service role only), which deletes in bounded
batches: expired AI usage counters, AI request hashes older than 30 days, AI
batches and API rate-limit windows older than a day, expired explanation
tickets without an active lease, and league history older than 12 weeks.
Scheduled daily by .github/workflows/maintenance.yml.
"""

import asyncio
import json

import httpx

from app.core.config import Settings
from app.integrations.gateway import Gateway

BATCH = 5000
MAX_ROUNDS = 20


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


async def main():
    settings = Settings()
    if not settings.database_ready:
        raise SystemExit("Configure Supabase before running maintenance.")
    async with httpx.AsyncClient(timeout=30) as client:
        totals = await run(Gateway(settings, client))
    print("Maintenance removed: " + json.dumps(totals, sort_keys=True))


if __name__ == "__main__":
    asyncio.run(main())

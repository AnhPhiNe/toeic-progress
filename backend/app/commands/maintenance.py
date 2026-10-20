"""Run from backend: python -m app.maintenance. Uses the configured project's service role."""

import asyncio

import httpx

from app.core.config import Settings
from app.integrations.gateway import Gateway


async def main():
    settings = Settings()
    if not settings.database_ready:
        raise SystemExit("Configure Supabase before running maintenance.")
    async with httpx.AsyncClient(timeout=30) as client:
        gateway = Gateway(settings, client)
        await gateway.rpc("cleanup_ai_usage", {})
        await gateway.rpc("cleanup_explanation_ledger", {"p_limit": 1000})
    print("Expired AI counters, request hashes and explanation cache cleaned up.")


if __name__ == "__main__":
    asyncio.run(main())

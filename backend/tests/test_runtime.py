import asyncio
from types import SimpleNamespace

import pytest

from app.core.config import Settings
from app.core.middleware import BodyLimitMiddleware
from app.core.runtime import RuntimeMiddleware
from app.main import create_app


def deployed_settings(**changes):
    values = dict(
        _env_file=None,
        environment="production",
        ai_enabled=False,
        api_limits_enabled=True,
        supabase_url="https://database.example",
        supabase_publishable_key="public",
        supabase_secret_key="server-secret",
        rate_limit_secret="a" * 32,
        allowed_hosts=["api.example"],
        cors_origins=["https://app.example"],
    )
    return Settings(**{**values, **changes})


@pytest.mark.parametrize(
    "changes",
    [
        {"api_limits_enabled": False},
        {"rate_limit_secret": "short"},
        {"allowed_hosts": ["*"]},
        {"cors_origins": ["http://localhost:3000"]},
        {"cors_origins": []},
        {"ai_enabled": True},
        {"supabase_secret_key": ""},
        {"cors_origins": ["https://app.example/"]},
        {"supabase_url": "http://database.example"},
    ],
)
def test_deployed_configuration_rejects_missing_protections(changes):
    with pytest.raises(ValueError, match="Deployment configuration incomplete"):
        create_app(deployed_settings(**changes))


def test_tracker_beta_accepts_config_and_hides_development_docs():
    settings = deployed_settings()
    settings.validate_deployment()
    app = create_app(settings)
    assert app.docs_url is None and app.openapi_url is None
    assert not settings.ai_ready
    assert deployed_settings(allowed_hosts=[], render_external_hostname="api.onrender.com").effective_allowed_hosts == [
        "api.onrender.com"
    ]


def scope():
    return {"type": "http", "method": "POST", "path": "/api/v1/sync", "headers": [], "client": ("test", 0)}


def test_concurrency_sheds_excess_work_and_releases_slot():
    async def run():
        entered, release = asyncio.Event(), asyncio.Event()
        results = []

        async def app(_scope, _receive, send):
            entered.set()
            await release.wait()
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"{}"})

        async def receive():
            return {"type": "http.request", "body": b""}

        async def send(message):
            if message["type"] == "http.response.start":
                results.append(message["status"])

        middleware = RuntimeMiddleware(app, Settings(_env_file=None, max_concurrent_requests=1))
        first = asyncio.create_task(middleware(scope(), receive, send))
        await entered.wait()
        await middleware(scope(), receive, send)
        assert results == [503]
        release.set()
        await first
        assert middleware.active == 0
        await middleware(scope(), receive, send)
        assert results == [503, 200, 200]

    asyncio.run(run())


def test_ingress_window_expires_without_retaining_addresses(monkeypatch):
    async def run():
        now = [0.0]
        monkeypatch.setattr("app.core.runtime.time", SimpleNamespace(monotonic=lambda: now[0]))
        statuses = []

        async def app(_scope, _receive, send):
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"{}"})

        async def receive():
            return {"type": "http.request", "body": b""}

        async def send(message):
            if message["type"] == "http.response.start":
                statuses.append(message["status"])

        middleware = RuntimeMiddleware(app, Settings(_env_file=None, ingress_ip_minute_limit=1))
        await middleware(scope(), receive, send)
        await middleware(scope(), receive, send)
        now[0] = 61
        await middleware(scope(), receive, send)
        assert statuses == [200, 429, 200]
        assert len(middleware.ip_windows) == 1

    asyncio.run(run())


def test_slow_body_is_rejected_before_application():
    async def run():
        messages = []

        async def app(*_args):
            pytest.fail("Slow upload reached application")

        async def receive():
            await asyncio.Event().wait()

        async def send(message):
            messages.append(message)

        await BodyLimitMiddleware(app, timeout=0.01)(scope(), receive, send)
        assert messages[0]["status"] == 408

    asyncio.run(run())

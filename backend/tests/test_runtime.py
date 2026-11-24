import asyncio
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.middleware import BodyLimitMiddleware
from app.core.runtime import RuntimeMiddleware, client_address
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
        client_ip_header="cf-connecting-ip",
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
        {
            "ai_enabled": True,
            "openai_api_key": "k",
            "turnstile_secret_key": "t",
            "turnstile_hostnames": ["app.example"],
            "ai_provider_budget_enabled": True,
            "ai_access_managed": False,
        },
        {
            "ai_enabled": True,
            "openai_api_key": "k",
            "turnstile_secret_key": "t",
            "turnstile_hostnames": ["app.example"],
            "ai_access_managed": True,
            "ai_provider_budget_enabled": False,
        },
        {"client_ip_debug": True},
        {"client_ip_header": ""},
        {"render_external_hostname": "api.onrender.com", "client_ip_header": ""},
        {"supabase_secret_key": ""},
        {"cors_origins": ["https://app.example/"]},
        {"supabase_url": "http://database.example"},
    ],
)
def test_deployed_configuration_rejects_missing_protections(changes):
    with pytest.raises(ValueError, match="Deployment configuration incomplete"):
        create_app(deployed_settings(**changes))


def test_secrets_are_hidden_from_settings_repr():
    settings = deployed_settings(
        openai_api_key="sk-secret-openai",
        supabase_secret_key="sb_secret_hidden",
        supabase_service_role_key="eyJ-legacy-hidden",
        turnstile_secret_key="ts-secret-hidden",
        rate_limit_secret="r" * 32,
    )
    rendered = repr(settings)
    for secret in ("sk-secret-openai", "sb_secret_hidden", "eyJ-legacy-hidden", "ts-secret-hidden", "r" * 32):
        assert secret not in rendered


def test_tracker_beta_accepts_config_and_hides_development_docs():
    settings = deployed_settings()
    settings.validate_deployment()
    app = create_app(settings)
    assert app.docs_url is None and app.openapi_url is None
    assert not settings.ai_ready
    assert deployed_settings(allowed_hosts=[], render_external_hostname="api.onrender.com").effective_allowed_hosts == [
        "api.onrender.com"
    ]
    deployed_settings(client_ip_header="", trust_socket_ip=True).validate_deployment()


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

        authed = {**scope(), "headers": [(b"authorization", b"Bearer test-token")]}
        await BodyLimitMiddleware(app, timeout=0.01)(authed, receive, send)
        assert messages[0]["status"] == 408

    asyncio.run(run())


def test_unauthenticated_post_and_oversized_content_length_reject_before_reading_body():
    async def run():
        async def app(*_args):
            pytest.fail("Request should not reach application")

        async def receive():
            pytest.fail("Middleware should not read stream before early rejection")

        unauth_messages = []

        async def capture_unauth(message):
            unauth_messages.append(message)

        extract_scope = {**scope(), "path": "/api/v1/ai/extract-page", "headers": []}
        await BodyLimitMiddleware(app, timeout=0.01)(extract_scope, receive, capture_unauth)
        assert unauth_messages[0]["status"] == 401

        big_messages = []

        async def capture_big(message):
            big_messages.append(message)

        oversized = {
            **scope(),
            "headers": [(b"authorization", b"Bearer test-token"), (b"content-length", str(5 * 1024 * 1024).encode())],
        }
        await BodyLimitMiddleware(app, maximum=4 * 1024 * 1024, timeout=0.01)(oversized, receive, capture_big)
        assert big_messages[0]["status"] == 413

    asyncio.run(run())


def test_raw_options_cannot_bypass_runtime_middleware_or_buffer_large_body():
    async def run():
        statuses = []

        async def app(_scope, _receive, send):
            await send({"type": "http.response.start", "status": 405, "headers": []})
            await send({"type": "http.response.body", "body": b""})

        async def receive():
            pytest.fail("OPTIONS must never read a request body")

        async def send(message):
            if message["type"] == "http.response.start":
                statuses.append(message["status"])

        options_scope = {**scope(), "method": "OPTIONS", "path": "/api/v1/ai/extract-page"}
        body_guarded = BodyLimitMiddleware(app, timeout=0.01)
        middleware = RuntimeMiddleware(body_guarded, Settings(_env_file=None, ingress_ip_minute_limit=1))
        await middleware(options_scope, receive, send)
        await middleware(options_scope, receive, send)
        assert statuses == [405, 429]

    asyncio.run(run())


def test_ai_concurrency_bulkhead_preserves_sync_slots_and_enforces_per_ip_cap():
    async def run():
        entered, release = asyncio.Event(), asyncio.Event()
        results = []

        async def app(req_scope, _receive, send):
            if req_scope["path"].startswith("/api/v1/ai/"):
                entered.set()
                await release.wait()
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"{}"})

        async def receive():
            return {"type": "http.request", "body": b""}

        async def send(message):
            if message["type"] == "http.response.start":
                results.append(message["status"])

        middleware = RuntimeMiddleware(
            app,
            Settings(_env_file=None, max_concurrent_requests=4, max_ai_concurrent_requests=1, max_concurrent_per_ip=1),
        )
        ai_scope = {**scope(), "path": "/api/v1/ai/extract-page", "client": ("203.0.113.10", 0)}
        sync_same_ip = {**scope(), "path": "/api/v1/sync", "client": ("203.0.113.10", 0)}
        sync_other_ip = {**scope(), "path": "/api/v1/sync", "client": ("203.0.113.11", 0)}
        ai_other_ip = {**scope(), "path": "/api/v1/ai/extract", "client": ("203.0.113.12", 0)}

        first = asyncio.create_task(middleware(ai_scope, receive, send))
        await entered.wait()
        # Same IP hits per-IP cap (503); another IP hitting AI hits AI bulkhead (503);
        # another IP hitting Sync still succeeds (200) because AI bulkhead preserves Sync slots.
        await middleware(sync_same_ip, receive, send)
        await middleware(ai_other_ip, receive, send)
        await middleware(sync_other_ip, receive, send)
        assert results == [503, 503, 200]
        release.set()
        await first
        assert middleware.active == 0 and middleware.ai_active == 0 and not middleware.ip_active

    asyncio.run(run())


def _with_header(name, value):
    request = scope()
    request["client"] = ("10.0.0.1", 0)  # the hosting proxy
    request["headers"] = [(name.encode(), value.encode())]
    return request


def test_client_address_ignores_forwarded_headers_unless_configured():
    settings = Settings(_env_file=None)
    assert client_address(_with_header("cf-connecting-ip", "203.0.113.7"), settings) == "10.0.0.1"
    assert client_address(_with_header("x-forwarded-for", "203.0.113.7"), settings) == "10.0.0.1"


def test_client_address_uses_only_a_valid_configured_edge_header():
    settings = Settings(_env_file=None, client_ip_header="cf-connecting-ip")
    assert client_address(_with_header("CF-Connecting-IP", "203.0.113.7"), settings) == "203.0.113.7"
    assert client_address(_with_header("cf-connecting-ip", "203.0.113.7, 198.51.100.1"), settings) == "10.0.0.1"
    assert client_address(_with_header("cf-connecting-ip", "not-an-ip"), settings) == "10.0.0.1"
    assert client_address(_with_header("x-forwarded-for", "203.0.113.7"), settings) == "10.0.0.1"
    # Duplicate edge headers are ambiguous and must fall back to socket IP.
    duplicate = {**scope(), "client": ("10.0.0.1", 0), "headers": [(b"cf-connecting-ip", b"1.1.1.1"), (b"cf-connecting-ip", b"2.2.2.2")]}
    assert client_address(duplicate, settings) == "10.0.0.1"
    # IPv6 addresses in the same /64 share one bucket to defeat IPv6 address rotation.
    assert client_address(_with_header("cf-connecting-ip", "2001:db8:abcd:1::1"), settings) == "2001:db8:abcd:1::/64"
    assert client_address(_with_header("cf-connecting-ip", "2001:db8:abcd:1::9999"), settings) == "2001:db8:abcd:1::/64"


def test_non_ascii_or_oversized_bearer_token_returns_401_instead_of_500():
    import httpx
    from fastapi import HTTPException

    from app.integrations.gateway import Gateway

    async def run():
        settings = Settings(
            _env_file=None,
            supabase_url="https://database.example",
            supabase_publishable_key="public",
            supabase_secret_key="server-secret",
        )
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(lambda _req: httpx.Response(200, json={"id": "not-a-uuid", "is_anonymous": False}))
        ) as client:
            gateway = Gateway(settings, client)
            for bad_token in ("café\u00ff", "a" * 9000, "token with space", "bad\r\ntoken"):
                with pytest.raises(HTTPException) as exc:
                    await gateway.authenticate(bad_token)
                assert exc.value.status_code == 401
            # Non-UUID id returned from Auth must also fail closed with 401.
            with pytest.raises(HTTPException) as exc:
                await gateway.authenticate("valid.jwt-token_123")
            assert exc.value.status_code == 401

    asyncio.run(run())


def test_users_behind_one_proxy_get_separate_ingress_windows():
    async def run():
        statuses = []

        async def app(_scope, _receive, send):
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"{}"})

        async def receive():
            return {"type": "http.request", "body": b""}

        async def send(message):
            if message["type"] == "http.response.start":
                statuses.append(message["status"])

        middleware = RuntimeMiddleware(app, Settings(_env_file=None, ingress_ip_minute_limit=1, client_ip_header="cf-connecting-ip"))
        await middleware(_with_header("cf-connecting-ip", "203.0.113.7"), receive, send)
        await middleware(_with_header("cf-connecting-ip", "198.51.100.1"), receive, send)
        await middleware(_with_header("cf-connecting-ip", "203.0.113.7"), receive, send)
        assert statuses == [200, 200, 429]

    asyncio.run(run())


def test_client_ip_debug_route_is_off_by_default():
    with TestClient(create_app(Settings(_env_file=None))) as client:
        assert client.get("/debug/client-ip").status_code == 404
    with TestClient(create_app(Settings(_env_file=None, client_ip_debug=True, client_ip_header="cf-connecting-ip"))) as client:
        body = client.get("/debug/client-ip", headers={"CF-Connecting-IP": "203.0.113.7"}).json()
        assert body["used_for_limits"] == "203.0.113.7" and body["configured_header"] == "cf-connecting-ip"

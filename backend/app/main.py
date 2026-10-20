"""Application composition. Route logic lives in app.api.routes."""

import asyncio
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.routes import account, ai, health, images, sync
from app.core.config import Settings
from app.core.middleware import BodyLimitMiddleware
from app.core.runtime import RuntimeMiddleware, configure_logging
from app.integrations.gateway import Gateway
from app.services.explain_tickets import TicketUses


def create_app(settings: Settings | None = None, transport: httpx.AsyncBaseTransport | None = None) -> FastAPI:
    settings = settings or Settings()
    settings.validate_deployment()

    @asynccontextmanager
    async def lifespan(app):
        configure_logging()
        async with httpx.AsyncClient(timeout=35, transport=transport) as client:
            app.state.gateway = Gateway(settings, client)
            app.state.ticket_uses = TicketUses(app.state.gateway.rpc)
            app.state.readiness_lock = asyncio.Lock()
            app.state.readiness = None
            yield

    app = FastAPI(
        title="TOEIC Progress API",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.environment == "development" else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.environment == "development" else None,
    )
    app.state.settings = settings
    app.add_middleware(BodyLimitMiddleware, timeout=settings.body_timeout_seconds)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.effective_allowed_hosts, www_redirect=False)
    app.add_middleware(RuntimeMiddleware, settings=settings)
    # CORS wraps early throttles and unexpected errors so browsers can read Retry-After/request IDs.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["X-Request-ID", "Retry-After", "X-Error-Code"],
    )

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_request, error):
        return JSONResponse(
            {
                "detail": "Dữ liệu không hợp lệ.",
                "fields": [".".join(str(item) for item in issue["loc"]) for issue in error.errors()[:10]],
            },
            status_code=422,
        )

    @app.exception_handler(httpx.HTTPError)
    async def unavailable(_request, _error):
        return JSONResponse({"detail": "Kết nối dịch vụ bị gián đoạn. Vui lòng thử lại sau."}, status_code=503)

    for router in (health.router, sync.router, ai.router, account.router, images.router):
        app.include_router(router)
    return app


app = create_app()

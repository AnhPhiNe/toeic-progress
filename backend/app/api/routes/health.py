import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.core.runtime import client_address, header_value

router = APIRouter()


@router.get("/health")
async def health(request: Request):
    settings = request.app.state.settings
    return {
        "status": "ok", "database_configured": settings.database_ready,
        "ai_configured": settings.ai_ready, "ai_provider": settings.ai_provider,
        "ai_enabled": settings.ai_enabled,
        "managed_ai_access": settings.ai_access_managed,
        "structured_mistake_input": True,
        "freeform_mistake_input": True,
        "part7_image_input": True,
        "part7_context_images": True,
        "part1_picture_input": True,
        "learner_error_category": True,
        "page_image_extraction": True,
        "result_image_reading": True,
        "result_image_scores": True,
        "result_image_timing": True,
        "attempt_analysis": settings.attempt_analysis_ready,
        "explain_tickets": bool(settings.rate_limit_secret),
        "persistent_source_images": settings.source_images_enabled,
    }


@router.get("/debug/client-ip", include_in_schema=False)
async def debug_client_ip(request: Request):
    """Operator check for CLIENT_IP_HEADER: compare with your public IP, then retry with forged headers."""
    settings = request.app.state.settings
    if not settings.client_ip_debug:
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    scope = request.scope
    return {
        "socket": (scope.get("client") or ("unknown", 0))[0],
        "configured_header": settings.client_ip_header or None,
        "configured_header_value": header_value(scope, settings.client_ip_header) if settings.client_ip_header else None,
        "cf_connecting_ip": header_value(scope, "cf-connecting-ip"),
        "true_client_ip": header_value(scope, "true-client-ip"),
        "x_forwarded_for": header_value(scope, "x-forwarded-for"),
        "used_for_limits": client_address(scope, settings),
    }


@router.get("/ready")
async def ready(request: Request):
    settings = request.app.state.settings
    # Single-flight, short-lived cache keeps public probes from flooding PostgREST.
    async with request.app.state.readiness_lock:
        cached = request.app.state.readiness
        if cached is None or time.monotonic() - cached[0] >= 15:
            reachable = await request.app.state.gateway.readiness()
            value = {
                "status": "ready" if reachable else "unavailable",
                "database_reachable": reachable,
                "ai_enabled": settings.ai_enabled,
                "ai_configured": settings.ai_ready,
                "ai_provider": settings.ai_provider,
            }
            cached = (time.monotonic(), value)
            request.app.state.readiness = cached
    return JSONResponse(cached[1], status_code=200 if cached[1]["database_reachable"] else 503)

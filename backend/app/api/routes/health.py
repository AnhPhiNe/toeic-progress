import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter()


@router.get("/health")
async def health(request: Request):
    settings = request.app.state.settings
    return {
        "status": "ok", "database_configured": settings.database_ready,
        "ai_configured": settings.ai_ready, "ai_provider": settings.ai_provider,
        "ai_enabled": settings.ai_enabled,
        "structured_mistake_input": True,
        "part7_image_input": True,
        "part7_context_images": True,
        "part1_picture_input": True,
        "learner_error_category": True,
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

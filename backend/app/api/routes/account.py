from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.dependencies import account
from app.schemas.models import ResetRequest

router = APIRouter()


@router.delete("/api/v1/account")
async def delete_account(request: Request, user=Depends(account)):
    await request.app.state.gateway.delete_account(user["id"])
    return {"deleted": True}


@router.post("/api/v1/data/reset")
async def reset_learning_data(body: ResetRequest, request: Request, user=Depends(account)):
    before = datetime.now(timezone.utc)
    result = await request.app.state.gateway.rpc("reset_learning_data", {"p_user_id": user["id"]})
    if request.app.state.settings.source_images_enabled:
        try:
            await request.app.state.gateway.source_images.cleanup_before(user["id"], before)
        except (HTTPException, httpx.HTTPError, ValueError, TypeError, KeyError):
            # The learning-data reset has committed. Keep a retry cutoff rather
            # than reporting rollback or re-running reset against fresh edits.
            result["sourceImageCleanupBefore"] = before.isoformat()
    return result

from fastapi import APIRouter, Depends, Request

from app.api.dependencies import account
from app.schemas.models import SyncRequest

router = APIRouter()


@router.post("/api/v1/sync")
async def synchronize(body: SyncRequest, request: Request, user=Depends(account)):
    gateway = request.app.state.gateway
    if body.after is not None:
        # Next page of a reply that said hasMore (only databases with security wave 2 page).
        return await gateway.rpc("sync_page", {"p_user_id": user["id"], "p_after": body.after}, data_errors=True)
    return await gateway.rpc(
        "sync_account_records",
        {
            "p_user_id": user["id"],
            "p_records": [record.model_dump(mode="json") for record in body.records],
            "p_cursor": body.cursor,
            "p_replace": body.replace,
        },
        data_errors=True,
    )

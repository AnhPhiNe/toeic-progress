from fastapi import APIRouter, Depends, Request

from app.api.dependencies import account
from app.schemas.models import SyncRequest

router = APIRouter()


@router.post("/api/v1/sync")
async def synchronize(body: SyncRequest, request: Request, user=Depends(account)):
    return await request.app.state.gateway.rpc(
        "sync_account_records",
        {
            "p_user_id": user["id"],
            "p_records": [record.model_dump(mode="json") for record in body.records],
            "p_cursor": body.cursor,
            "p_replace": body.replace,
        },
    )

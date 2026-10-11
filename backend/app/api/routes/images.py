from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.dependencies import account
from app.schemas.models import CleanupSourceImages, SourceImageIds, UploadSourceImages

router = APIRouter()


@router.post("/api/v1/mistake-images")
async def upload_source_images(body: UploadSourceImages, request: Request, user=Depends(account)):
    return {"sourceImageIds": await request.app.state.gateway.source_images.upload(user["id"], body.images)}


@router.post("/api/v1/mistake-images/urls")
async def source_image_urls(body: SourceImageIds, request: Request, user=Depends(account)):
    return {"images": await request.app.state.gateway.source_images.urls(user["id"], body.sourceImageIds)}


@router.post("/api/v1/mistake-images/cleanup")
async def cleanup_source_images(body: CleanupSourceImages, request: Request, user=Depends(account)):
    if body.before > datetime.now(timezone.utc):
        raise HTTPException(422, "Thời điểm dọn ảnh không hợp lệ.")
    await request.app.state.gateway.source_images.cleanup_before(user["id"], body.before)
    return {"cleaned": True}

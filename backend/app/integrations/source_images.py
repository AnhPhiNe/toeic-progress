"""Private, owner-scoped image storage; callers persist hashes, never signed URLs."""

import asyncio
import base64
import hashlib
from datetime import datetime

from fastapi import HTTPException

from app.core.image_input import (
    MAX_IMAGE_BYTES,
    MAX_TOTAL_IMAGE_BYTES,
    reencode_source_jpeg_async,
    validate_images_async,
)

BUCKET = "mistake-sources"


class SourceImages:
    def __init__(self, gateway):
        self.gateway = gateway
        self.client = gateway.client
        self.base = gateway.settings.supabase_url.rstrip("/") + "/storage/v1"

    async def private_bucket_exists(self, *, allow_missing: bool = False) -> bool:
        response = await self.client.get(f"{self.base}/bucket/{BUCKET}", headers=self.gateway.admin_headers(), timeout=8)
        if allow_missing and response.status_code in (400, 404):
            try:
                body = response.json()
            except ValueError:
                body = {}
            detail = f"{body.get('error', '')} {body.get('message', '')}".lower() if isinstance(body, dict) else ""
            if response.status_code == 404 or str(body.get("statusCode")) == "404" or "not found" in detail:
                return False
        if not response.is_success or response.json().get("public") is not False:
            raise HTTPException(503, "Kho ảnh riêng tư chưa sẵn sàng. Chưa lưu hoặc gửi ảnh để phân tích.")
        return True

    async def check_private(self):
        if not self.gateway.settings.source_images_enabled:
            raise HTTPException(503, "Lưu ảnh nguồn chưa được bật. Nội dung đang nhập vẫn được giữ.")
        await self.private_bucket_exists(allow_missing=False)

    @staticmethod
    def path(user_id: str, image_id: str) -> str:
        return f"{BUCKET}/{user_id}/{image_id}.jpg"

    async def upload(self, user_id: str, attachments) -> list[str]:
        await self.check_private()
        listing = await self.client.post(
            f"{self.base}/object/list/{BUCKET}", headers=self.gateway.admin_headers(), timeout=8,
            json={"prefix": user_id + "/", "limit": self.gateway.settings.source_image_account_limit + 1, "offset": 0},
        )
        if not listing.is_success or not isinstance(listing.json(), list):
            raise HTTPException(503, "Chưa kiểm tra được dung lượng kho ảnh. Nội dung đang nhập vẫn được giữ.")
        known = {row.get("name") for row in listing.json() if isinstance(row, dict)}
        result = []
        for attachment in attachments:
            try:
                data = await reencode_source_jpeg_async(attachment.dataUrl)
            except ValueError as error:
                raise HTTPException(422, str(error)) from error
            if len(data) > MAX_IMAGE_BYTES:
                raise HTTPException(422, "Ảnh sau xử lý quá lớn. Hãy cắt gọn ảnh trước khi lưu.")
            image_id = hashlib.sha256(data).hexdigest()
            filename = image_id + ".jpg"
            if filename in known:
                if image_id not in result:
                    result.append(image_id)
                continue
            if len(known) >= self.gateway.settings.source_image_account_limit:
                raise HTTPException(429, "Kho ảnh của tài khoản đã đạt giới hạn lưu. Dùng lại ảnh đã có hoặc liên hệ hỗ trợ để tăng dung lượng.")
            response = await self.client.post(
                f"{self.base}/object/{self.path(user_id, image_id)}", content=data, timeout=10,
                headers={**self.gateway.admin_headers(), "Content-Type": "image/jpeg", "x-upsert": "false"},
            )
            duplicate = response.status_code == 409
            if response.status_code == 400:
                try:
                    duplicate = response.json().get("error") == "Duplicate" or str(response.json().get("statusCode")) == "409"
                except (ValueError, AttributeError):
                    pass
            if not response.is_success and not duplicate:
                raise HTTPException(503, "Chưa lưu được ảnh nguồn. Ảnh đang chọn được giữ để thử lại.")
            if image_id not in result:
                result.append(image_id)
            known.add(filename)
        return result

    async def urls(self, user_id: str, image_ids: list[str]):
        await self.check_private()
        result = []
        for image_id in image_ids:
            path = self.path(user_id, image_id)
            response = await self.client.post(
                f"{self.base}/object/sign/{path}", json={"expiresIn": 600}, headers=self.gateway.admin_headers(), timeout=8,
            )
            if not response.is_success:
                raise HTTPException(404, "Ảnh nguồn không còn tồn tại hoặc không thuộc tài khoản này.")
            signed = response.json().get("signedURL")
            if not isinstance(signed, str) or not signed.startswith(f"/object/sign/{path}?"):
                raise HTTPException(503, "Chưa mở được ảnh nguồn. Vui lòng thử lại.")
            result.append({"id": image_id, "url": self.base + signed})
        return result

    async def load(self, user_id: str, image_ids: list[str]) -> list[str]:
        await self.check_private()
        result = []
        total_bytes = 0
        for image_id in image_ids:
            async with self.client.stream(
                "GET", f"{self.base}/object/{self.path(user_id, image_id)}", headers=self.gateway.admin_headers(), timeout=10,
            ) as response:
                if not response.is_success:
                    raise HTTPException(404, "Chưa đọc được ảnh nguồn của tài khoản này. Chọn lại ảnh trước khi phân tích.")
                data = bytearray()
                async for chunk in response.aiter_bytes():
                    data.extend(chunk)
                    if len(data) > MAX_IMAGE_BYTES:
                        raise HTTPException(422, "Ảnh nguồn vượt giới hạn dung lượng.")
            value = "data:image/jpeg;base64," + base64.b64encode(data).decode()
            total_bytes += len(data)
            if total_bytes > MAX_TOTAL_IMAGE_BYTES:
                raise HTTPException(422, "Tổng ảnh nguồn vượt giới hạn 2 MiB.")
            result.append(value)
        try:
            await validate_images_async(result, MAX_IMAGE_BYTES)
        except ValueError as error:
            raise HTTPException(422, "Ảnh nguồn không hợp lệ. Chọn lại ảnh để tiếp tục.") from error
        return result

    async def purge(self, user_id: str, *, allow_missing: bool = False):
        """Used only by the owner's explicit reset/account deletion, never a shared-card edit."""
        try:
            async with asyncio.timeout(30):
                if not await self.private_bucket_exists(allow_missing=allow_missing):
                    return
                for _ in range(100):
                    response = await self.client.post(
                        f"{self.base}/object/list/{BUCKET}", headers=self.gateway.admin_headers(), timeout=8,
                        json={"prefix": user_id + "/", "limit": 100, "offset": 0, "sortBy": {"column": "name", "order": "asc"}},
                    )
                    if not response.is_success or not isinstance(response.json(), list):
                        raise HTTPException(503, "Chưa đọc được danh sách ảnh nguồn để xóa. Vui lòng thử lại.")
                    rows = response.json()
                    if not rows:
                        return
                    paths = [user_id + "/" + row["name"] for row in rows
                             if isinstance(row, dict) and isinstance(row.get("name"), str) and "/" not in row["name"]]
                    if len(paths) != len(rows):
                        raise HTTPException(503, "Kho ảnh có dữ liệu cần kiểm tra trước khi xóa.")
                    deleted = await self.client.request(
                        "DELETE", f"{self.base}/object/{BUCKET}", headers=self.gateway.admin_headers(), timeout=8,
                        json={"prefixes": paths},
                    )
                    if not deleted.is_success:
                        raise HTTPException(503, "Chưa xóa hết ảnh nguồn. Vui lòng thử lại.")
        except TimeoutError as error:
            raise HTTPException(503, "Quá thời gian dọn ảnh nguồn. Vui lòng thử lại.") from error
        raise HTTPException(503, "Ảnh nguồn còn đang được dọn. Vui lòng thử lại để hoàn tất.")

    async def cleanup_before(self, user_id: str, before: datetime, *, allow_missing: bool = False):
        """Retry a completed reset without removing newly saved/referenced images."""
        try:
            async with asyncio.timeout(30):
                if not await self.private_bucket_exists(allow_missing=allow_missing):
                    return
                referenced = set()
                for offset in range(0, 100_000, 1000):
                    response = await self.client.get(
                        self.gateway.settings.supabase_url.rstrip("/") + "/rest/v1/mistakes",
                        headers=self.gateway.admin_headers(), timeout=8,
                        params={"select": "sourceImageIds:extra->sourceImageIds",
                                "user_id": "eq." + user_id, "order": "id.asc", "limit": 1000, "offset": offset},
                    )
                    if not response.is_success or not isinstance(response.json(), list):
                        raise HTTPException(503, "Chưa đối chiếu được ảnh đang dùng. Chưa xóa ảnh nguồn.")
                    rows = response.json()
                    for row in rows:
                        if isinstance(row.get("sourceImageIds"), list):
                            referenced.update(value for value in row["sourceImageIds"] if isinstance(value, str))
                    if len(rows) < 1000:
                        break
                else:
                    raise HTTPException(503, "Cần kiểm tra kho ảnh lớn trước khi dọn.")
                paths = []
                for offset in range(0, 100_000, 1000):
                    response = await self.client.post(
                        f"{self.base}/object/list/{BUCKET}", headers=self.gateway.admin_headers(), timeout=8,
                        json={"prefix": user_id + "/", "limit": 1000, "offset": offset,
                              "sortBy": {"column": "name", "order": "asc"}},
                    )
                    if not response.is_success or not isinstance(response.json(), list):
                        raise HTTPException(503, "Chưa đọc được kho ảnh để dọn. Vui lòng thử lại.")
                    rows = response.json()
                    for row in rows:
                        name = row.get("name", "")
                        created = row.get("created_at")
                        if not isinstance(created, str) or not isinstance(name, str) or not name.endswith(".jpg") or "/" in name:
                            continue
                        try:
                            older = datetime.fromisoformat(created.replace("Z", "+00:00")) <= before
                        except (ValueError, TypeError):
                            continue
                        if older and name[:-4] not in referenced:
                            paths.append(user_id + "/" + name)
                    if len(rows) < 1000:
                        break
                else:
                    raise HTTPException(503, "Cần kiểm tra kho ảnh lớn trước khi dọn.")
                for start in range(0, len(paths), 100):
                    response = await self.client.request(
                        "DELETE", f"{self.base}/object/{BUCKET}", headers=self.gateway.admin_headers(), timeout=8,
                        json={"prefixes": paths[start:start + 100]},
                    )
                    if not response.is_success:
                        raise HTTPException(503, "Chưa xóa hết ảnh nguồn. Vui lòng thử lại.")
        except TimeoutError as error:
            raise HTTPException(503, "Quá thời gian dọn ảnh nguồn. Vui lòng thử lại.") from error

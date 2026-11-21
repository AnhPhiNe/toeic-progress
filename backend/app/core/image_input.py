"""Bounded inline image input; no remote fetches or persistent image storage."""

import asyncio
import base64
import binascii
import re
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_IMAGE_BYTES = 1024 * 1024
MAX_TOTAL_IMAGE_BYTES = 2 * 1024 * 1024
MAX_IMAGE_PIXELS = 8_000_000
MAX_DATA_URL_LENGTH = 4 * ((MAX_IMAGE_BYTES + 2) // 3) + 32
# Screenshots of a test page are read as they are (originals give the best reading); the page route takes bigger ones.
MAX_PAGE_IMAGE_BYTES = 4 * 1024 * 1024
MAX_PAGE_TOTAL_BYTES = 8 * 1024 * 1024
MAX_PAGE_DATA_URL_LENGTH = 4 * ((MAX_PAGE_IMAGE_BYTES + 2) // 3) + 32

_EXIF_ORIENTATION_TAG = 274
_IMAGE_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="toeic-img")


def image_bytes(value: str, max_bytes: int = MAX_IMAGE_BYTES) -> bytes:
    match = re.fullmatch(r"data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})", value)
    if not match:
        raise ValueError("Ảnh cần PNG, JPEG hoặc WebP dạng dữ liệu nội tuyến")
    try:
        data = base64.b64decode(match[2], validate=True)
    except (ValueError, binascii.Error) as error:
        raise ValueError("Dữ liệu ảnh không hợp lệ") from error
    if not data or len(data) > max_bytes:
        raise ValueError(f"Mỗi ảnh gửi đi tối đa {max_bytes // (1024 * 1024)} MiB")
    try:
        with Image.open(BytesIO(data)) as picture:
            expected = {"png": "PNG", "jpeg": "JPEG", "webp": "WEBP"}[match[1]]
            if picture.format != expected or getattr(picture, "n_frames", 1) != 1:
                raise ValueError("Loại ảnh không khớp hoặc ảnh động không được hỗ trợ")
            if picture.width * picture.height > MAX_IMAGE_PIXELS:
                raise ValueError("Ảnh có quá nhiều điểm ảnh")
            picture.verify()
        with Image.open(BytesIO(data)) as picture:
            picture.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise ValueError("Không đọc được ảnh") from error
    return data


def normalize_upright_data_url(value: str, max_bytes: int = MAX_PAGE_IMAGE_BYTES) -> str:
    """Zero-destructive orientation fix: keep upright bytes untouched, transpose only when EXIF orientation != 1."""
    match = re.fullmatch(r"data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})", value)
    if not match:
        return value
    mime = match[1]
    try:
        raw = base64.b64decode(match[2], validate=True)
    except (ValueError, binascii.Error):
        return value
    try:
        with Image.open(BytesIO(raw)) as picture:
            orientation = picture.getexif().get(_EXIF_ORIENTATION_TAG, 1)
            if orientation in (None, 1):
                return value
            transposed = ImageOps.exif_transpose(picture)
            fmt = {"png": "PNG", "jpeg": "JPEG", "webp": "WEBP"}[mime]
            if fmt == "JPEG" and transposed.mode not in ("RGB", "L"):
                transposed = transposed.convert("RGB")
            qualities = (92, 86) if fmt in ("JPEG", "WEBP") else (None,)
            for quality in qualities:
                out = BytesIO()
                save_kwargs = {"format": fmt}
                if fmt == "JPEG":
                    save_kwargs.update(quality=quality, optimize=True)
                elif fmt == "WEBP":
                    save_kwargs.update(quality=quality)
                else:
                    save_kwargs.update(optimize=True)
                transposed.save(out, **save_kwargs)
                encoded = out.getvalue()
                if len(encoded) <= max_bytes:
                    return f"data:image/{mime};base64,{base64.b64encode(encoded).decode('ascii')}"
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        return value
    return value


async def normalize_upright_images(values: list[str], max_bytes: int = MAX_PAGE_IMAGE_BYTES) -> list[str]:
    """Run EXIF upright checks off the main event loop with bounded global thread concurrency."""
    if not values:
        return []
    loop = asyncio.get_running_loop()
    return list(await asyncio.gather(*(
        loop.run_in_executor(_IMAGE_EXECUTOR, normalize_upright_data_url, item, max_bytes)
        for item in values
    )))

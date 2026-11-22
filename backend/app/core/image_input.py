"""Bounded inline image input; no remote fetches or persistent image storage."""

import asyncio
import base64
import binascii
import re
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO

from PIL import Image, ImageOps, PngImagePlugin, UnidentifiedImageError

MAX_IMAGE_BYTES = 1024 * 1024
MAX_TOTAL_IMAGE_BYTES = 2 * 1024 * 1024
# A single-card analysis may send up to MAX_ANALYZE_IMAGES passage images (Part 6/7), each prepared to ~600 KiB.
MAX_ANALYZE_IMAGES = 4
MAX_ANALYZE_TOTAL_BYTES = 3 * 1024 * 1024
MAX_IMAGE_PIXELS = 8_000_000
MAX_DATA_URL_LENGTH = 4 * ((MAX_IMAGE_BYTES + 2) // 3) + 32
# Screenshots of a test page are read as they are (originals give the best reading); the page route takes bigger ones.
MAX_PAGE_IMAGE_BYTES = 4 * 1024 * 1024
MAX_PAGE_TOTAL_BYTES = 8 * 1024 * 1024
MAX_PAGE_DATA_URL_LENGTH = 4 * ((MAX_PAGE_IMAGE_BYTES + 2) // 3) + 32

# Enforce decompression and PNG text-chunk (zTXt/iTXt/iCCP) ceilings globally before Image.open() reads headers.
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
PngImagePlugin.MAX_TEXT_CHUNK = 16 * 1024
PngImagePlugin.MAX_TEXT_MEMORY = 64 * 1024

_EXIF_ORIENTATION_TAG = 274
_IMAGE_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="toeic-img")


def image_header_bytes(value: str, max_bytes: int = MAX_IMAGE_BYTES) -> tuple[str, bytes]:
    """Fast O(n) format, base64 and byte-size check without invoking Pillow."""
    match = re.fullmatch(r"data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})", value)
    if not match:
        raise ValueError("Ảnh cần PNG, JPEG hoặc WebP dạng dữ liệu nội tuyến")
    try:
        data = base64.b64decode(match[2], validate=True)
    except (ValueError, binascii.Error) as error:
        raise ValueError("Dữ liệu ảnh không hợp lệ") from error
    if not data or len(data) > max_bytes:
        raise ValueError(f"Mỗi ảnh gửi đi tối đa {max_bytes // (1024 * 1024)} MiB")
    return match[1], data


def image_bytes(value: str, max_bytes: int = MAX_IMAGE_BYTES) -> bytes:
    mime, data = image_header_bytes(value, max_bytes)
    expected = {"png": "PNG", "jpeg": "JPEG", "webp": "WEBP"}[mime]
    try:
        with Image.open(BytesIO(data)) as picture:
            if picture.format != expected or getattr(picture, "n_frames", 1) != 1:
                raise _ImageConstraintError("Loại ảnh không khớp hoặc ảnh động không được hỗ trợ")
            if picture.width * picture.height > MAX_IMAGE_PIXELS:
                raise _ImageConstraintError("Ảnh có quá nhiều điểm ảnh")
            picture.load()
    except _ImageConstraintError as error:
        raise ValueError(str(error)) from error
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as error:
        raise ValueError("Không đọc được ảnh") from error
    return data


class _ImageConstraintError(Exception):
    pass


def reencode_source_jpeg(value: str, max_bytes: int = MAX_IMAGE_BYTES) -> bytes:
    """Validate and re-encode a source image to upright EXIF-free JPEG in a single Pillow pass."""
    mime, data = image_header_bytes(value, max_bytes)
    expected = {"png": "PNG", "jpeg": "JPEG", "webp": "WEBP"}[mime]
    try:
        with Image.open(BytesIO(data)) as picture:
            if picture.format != expected or getattr(picture, "n_frames", 1) != 1:
                raise _ImageConstraintError("Loại ảnh không khớp hoặc ảnh động không được hỗ trợ")
            if picture.width * picture.height > MAX_IMAGE_PIXELS:
                raise _ImageConstraintError("Ảnh có quá nhiều điểm ảnh")
            picture.load()
            encoded = BytesIO()
            ImageOps.exif_transpose(picture).convert("RGB").save(encoded, format="JPEG", quality=90)
    except _ImageConstraintError as error:
        raise ValueError(str(error)) from error
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as error:
        raise ValueError("Không đọc được ảnh") from error
    return encoded.getvalue()


async def validate_images_async(values: list[str], max_bytes: int = MAX_PAGE_IMAGE_BYTES) -> None:
    """Run Pillow raster validation off the main asyncio event loop."""
    if not values:
        return
    loop = asyncio.get_running_loop()
    await asyncio.gather(*(loop.run_in_executor(_IMAGE_EXECUTOR, image_bytes, item, max_bytes) for item in values))


async def reencode_source_jpeg_async(value: str, max_bytes: int = MAX_IMAGE_BYTES) -> bytes:
    """Run source-image validation + JPEG re-encoding off the main asyncio event loop."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_IMAGE_EXECUTOR, reencode_source_jpeg, value, max_bytes)


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
                    save_kwargs.update(compress_level=1)
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

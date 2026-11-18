"""Bounded inline image input; no remote fetches or persistent image storage."""

import base64
import binascii
import re
from io import BytesIO

from PIL import Image, UnidentifiedImageError

MAX_IMAGE_BYTES = 1024 * 1024
MAX_TOTAL_IMAGE_BYTES = 2 * 1024 * 1024
MAX_IMAGE_PIXELS = 8_000_000
MAX_DATA_URL_LENGTH = 4 * ((MAX_IMAGE_BYTES + 2) // 3) + 32
# Screenshots of a test page are read as they are (originals give the best reading); the page route takes bigger ones.
MAX_PAGE_IMAGE_BYTES = 4 * 1024 * 1024
MAX_PAGE_TOTAL_BYTES = 8 * 1024 * 1024
MAX_PAGE_DATA_URL_LENGTH = 4 * ((MAX_PAGE_IMAGE_BYTES + 2) // 3) + 32


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

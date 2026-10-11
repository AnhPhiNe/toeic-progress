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


def image_bytes(value: str) -> bytes:
    match = re.fullmatch(r"data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})", value)
    if not match:
        raise ValueError("Ảnh cần PNG, JPEG hoặc WebP dạng dữ liệu nội tuyến")
    try:
        data = base64.b64decode(match[2], validate=True)
    except (ValueError, binascii.Error) as error:
        raise ValueError("Dữ liệu ảnh không hợp lệ") from error
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise ValueError("Mỗi ảnh gửi đi tối đa 1 MiB")
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

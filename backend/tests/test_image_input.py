import base64
from io import BytesIO

import pytest
from PIL import Image
from pydantic import ValidationError

from app.schemas.models import ExtractRequest, ImageAttachment


def image_url(size=(120, 80), format="PNG"):
    stream = BytesIO()
    Image.new("RGB", size, "white").save(stream, format=format)
    return f"data:image/{'jpeg' if format == 'JPEG' else format.lower()};base64," + base64.b64encode(stream.getvalue()).decode()


def request(images, **changes):
    fields = {"text": "", "provider": "openai", "consent": True,
              "request_id": "22222222-2222-4222-8222-222222222222",
              "input": {"question": "What should employees do?", "options": ["(A) Call.", "(B) Write.", "(C) Wait.", "(D) Leave."], "context": "", "part": 7,
                        "userChoiceState": "CHOSEN", "userChoice": "A", "sourceAnswer": "B"},
              "images": [{"dataUrl": value} for value in images], **changes}
    return ExtractRequest.model_validate(fields)


def test_context_images_keep_the_pasted_question_options_learner_choice_and_source_key():
    result = request([image_url()])
    assert result.input.part == 7 and result.input.question == "What should employees do?" and len(result.input.options) == 4
    assert result.input.userChoice == "A" and result.input.sourceAnswer == "B"
    assert "data:image" not in repr(result)


@pytest.mark.parametrize("value", [
    "https://private.example/image.png", "data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/png;base64,not-base64", "data:image/png;base64,YmFkLWltYWdl",
    "data:image/png;base64," + "A" * 1_400_000,
], ids=["remote-url", "svg", "invalid-base64", "corrupt-raster", "oversized"])
def test_untrusted_urls_types_corrupt_and_oversized_images_are_rejected(value):
    with pytest.raises(ValidationError):
        request([value])


def test_image_mime_must_match_actual_bytes_and_pixel_count_is_bounded():
    with pytest.raises(ValidationError):
        request([image_url(format="JPEG").replace("image/jpeg", "image/png")])
    with pytest.raises(ValidationError):
        request([image_url(size=(3000, 3000), format="JPEG")])


def test_total_image_size_is_bounded_even_when_each_image_is_valid():
    stream = BytesIO()
    Image.new("RGB", (580, 580), "white").save(stream, format="PNG", compress_level=0)
    value = "data:image/png;base64," + base64.b64encode(stream.getvalue()).decode()
    assert ImageAttachment(dataUrl=value).byte_count < 1024 * 1024
    # Four passage images fit the count but not the 3 MiB analysis total.
    with pytest.raises(ValidationError):
        request([value] * 4)


def test_analysis_accepts_four_passage_images_and_rejects_five():
    assert len(request([image_url()] * 4).images) == 4
    part6 = {"question": "The entire project was ____ financed.", "options": ["(A) larger", "(B) largeness", "(C) large", "(D) largely"],
             "context": "", "part": 6, "userChoiceState": "CHOSEN", "userChoice": "B"}
    assert request([image_url()] * 4, input=part6).input.part == 6
    with pytest.raises(ValidationError):
        request([image_url()] * 5)


def test_image_count_and_part_restrictions_do_not_weaken_text_validation():
    with pytest.raises(ValidationError):
        request([image_url()] * 5)
    with pytest.raises(ValidationError):
        request([image_url()], input={"question": "Question", "options": [], "part": 5,
                                     "userChoiceState": "UNKNOWN"})
    with pytest.raises(ValidationError):
        request([])
    with pytest.raises(ValidationError):
        request([image_url()], input={"question": "", "options": [], "part": 7, "userChoiceState": "UNKNOWN"})
    with pytest.raises(ValidationError):
        request([image_url()], input={"question": "Question", "options": ["(A) Call.", "(B) Write."], "part": 7,
                                     "userChoiceState": "UNKNOWN"})


def test_truncated_raster_is_rejected_before_generation():
    url = image_url(format="JPEG")
    data = base64.b64decode(url.split(",", 1)[1])
    broken = "data:image/jpeg;base64," + base64.b64encode(data[:-30]).decode()
    with pytest.raises(ValidationError):
        request([broken])


def test_part1_requires_one_picture_and_four_pasted_spoken_options():
    fields = {"question": "Part 1 · Mô tả tranh", "options": ["(A) A man is seated.", "(B) A man is walking.",
              "(C) A car is parked.", "(D) A door is closed."], "part": 1, "userChoiceState": "UNKNOWN"}
    result = request([image_url()], input=fields)
    assert result.input.part == 1 and len(result.images) == 1
    for images, options in [([], fields["options"]), ([image_url()] * 2, fields["options"]), ([image_url()], fields["options"][:3])]:
        with pytest.raises(ValidationError):
            request(images, text="text" * 10, input={**fields, "options": options})


def test_normalize_upright_keeps_upright_bytes_untouched_and_transposes_exif_rotated_jpeg():
    import asyncio

    from app.core.image_input import normalize_upright_data_url, normalize_upright_images

    # Upright image with no EXIF orientation tag stays byte-for-byte identical.
    upright = image_url(size=(160, 90), format="JPEG")
    assert normalize_upright_data_url(upright) == upright

    # EXIF orientation 6 (90 deg CW): 160x90 raw pixels must transpose to 90x160 upright.
    img = Image.new("RGB", (160, 90), "white")
    exif = img.getexif()
    exif[274] = 6
    stream = BytesIO()
    img.save(stream, format="JPEG", exif=exif)
    rotated_url = "data:image/jpeg;base64," + base64.b64encode(stream.getvalue()).decode()

    fixed_list = asyncio.run(normalize_upright_images([upright, rotated_url]))
    assert fixed_list[0] == upright
    assert fixed_list[1] != rotated_url
    raw_fixed = base64.b64decode(fixed_list[1].split(",", 1)[1])
    with Image.open(BytesIO(raw_fixed)) as result:
        assert result.size == (90, 160)
        assert result.getexif().get(274, 1) == 1


def test_png_ztxt_decompression_bomb_is_rejected_by_global_pillow_limits():
    from PIL import PngImagePlugin

    from app.core.image_input import MAX_IMAGE_PIXELS, image_bytes

    assert Image.MAX_IMAGE_PIXELS == MAX_IMAGE_PIXELS
    assert PngImagePlugin.MAX_TEXT_MEMORY == 64 * 1024
    assert PngImagePlugin.MAX_TEXT_CHUNK == 16 * 1024

    # Build a tiny 1x1 PNG with a highly compressible 128 KiB zTXt payload (> 64 KiB cap).
    info = PngImagePlugin.PngInfo()
    info.add_text("bomb", "A" * (128 * 1024), zip=True)
    stream = BytesIO()
    Image.new("RGB", (1, 1), "white").save(stream, format="PNG", pnginfo=info)
    data_url = "data:image/png;base64," + base64.b64encode(stream.getvalue()).decode()
    assert len(stream.getvalue()) < 4096  # tiny compressed file on wire
    with pytest.raises(ValueError, match="Không đọc được ảnh"):
        image_bytes(data_url)

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
    Image.new("RGB", (500, 500), "white").save(stream, format="PNG", compress_level=0)
    value = "data:image/png;base64," + base64.b64encode(stream.getvalue()).decode()
    assert ImageAttachment(dataUrl=value).byte_count < 1024 * 1024
    with pytest.raises(ValidationError):
        request([value] * 3)


def test_image_count_and_part_restrictions_do_not_weaken_text_validation():
    with pytest.raises(ValidationError):
        request([image_url()] * 4)
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

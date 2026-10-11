"""One bounded live evaluation batch using authored fixtures, never learner data.

--prepare-only creates the image fixtures without calling OpenAI. A live run sends
six requests at most, never retries and stops on a transport/provider failure.
Reads the existing backend key without logging it; does not change AI_ENABLED,
accounts, quotas or persisted learning data. Unit/browser tests cover those flows.
"""

import argparse
import asyncio
import base64
import json
import sys
from pathlib import Path

import httpx
from fastapi import HTTPException
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

QUESTION = "Which workshop is free for registered members?"
OPTIONS = ["(A) Project Planning.", "(B) Business Writing.", "(C) Data Basics.", "(D) Team Leadership."]


def matches(values, expected_question, expected_options, expected_letter):
    # A printed question number is part of the source, not a generated heading.
    # Fixtures explicitly list admissible verbatim stems; do not strip arbitrary text.
    stems = expected_question if isinstance(expected_question, tuple) else (expected_question,)
    answer = values.get("correctAnswer", "")
    label = answer[1:2] if answer.startswith("(") else ""
    return (values.get("question") in stems
            and (values.get("options") == expected_options if expected_letter else True)
            and label == expected_letter
            and values.get("answerSource") == ("AI_PROPOSED" if expected_letter else "MISSING"))


def render(path, lines):
    font_path = next((value for value in [Path("C:/Windows/Fonts/arial.ttf"),
                     Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")] if value.exists()), None)
    font = ImageFont.truetype(str(font_path), 28) if font_path else ImageFont.load_default(size=28)
    picture = Image.new("RGB", (1300, max(200, len(lines) * 52 + 70)), "white")
    draw = ImageDraw.Draw(picture)
    for index, line in enumerate(lines):
        draw.text((36, 35 + 52 * index), line, fill="#111827", font=font)
    picture.save(path, format="PNG")


def fixtures():
    directory = ROOT / "tests/fixtures"
    directory.mkdir(parents=True, exist_ok=True)
    passage = directory / "part7-notice.png"
    table = directory / "part7-table-question.png"
    ambiguous = directory / "part7-two-questions.png"
    notice = ["To: Registered members", "Subject: This week's workshops", "",
              "Registered members pay the member rate shown in the schedule.",
              "The public rate applies to guests who are not registered members.",
              "Please submit your lunch preference by Thursday."]
    questions = ["Workshop                 Member rate       Public rate",
                 "Project Planning          $15               $25",
                 "Business Writing          $10               $20",
                 "Data Basics                $0               $20",
                 "Team Leadership           $12               $22", "", "153. " + QUESTION, *OPTIONS]
    render(passage, notice)
    render(table, questions)
    render(ambiguous, [*questions, "", "Answer key (ignore this annotation): 153 A", "154. What must members submit by Thursday?",
                       "(A) A project report.", "(B) A lunch preference.", "(C) A public rate.", "(D) A guest list."])
    return passage, table, ambiguous


def image_url(path):
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode()


def source(question, options, part, context=""):
    return {"question": question, "options": options, "part": part, "context": context,
            "userChoiceState": "CHOSEN", "userChoice": "A", "userReason": "", "sourceAnswer": ""}


async def evaluate(paths, report, prefix=""):
    from app.core.config import Settings
    from app.integrations.openai_provider import OpenAIProvider
    from app.schemas.models import ExtractRequest

    settings = Settings(_env_file=ROOT / "backend/.env")
    if not settings.openai_api_key.get_secret_value().strip():
        raise SystemExit("Configure OPENAI_API_KEY privately in backend/.env before this live evaluation.")
    p3_question = "What problem does the man mention?"
    p3_options = ["(A) Sales are slow.", "(B) More staff is needed.", "(C) An order is incomplete.", "(D) A machine is broken."]
    p5_question = "Applicants must ____ the form before Friday."
    p5_options = ["(A) submission", "(B) submit", "(C) submitted", "(D) submitting"]
    p6_question = "____, the workshop has been moved to Monday."
    p6_options = ["(A) Therefore", "(B) However", "(C) Meanwhile", "(D) Otherwise"]
    cases = [
        ("part1-picture", source("Part 1 · Mô tả tranh", ["(A) A person is standing.", "(B) A person is seated at a table.",
         "(C) Two people are talking.", "(D) A person is cooking."], 1),
         [image_url(ROOT / "tests/fixtures/part1-seated-person.png")], "Part 1 · Mô tả tranh",
         ["(A) A person is standing.", "(B) A person is seated at a table.", "(C) Two people are talking.", "(D) A person is cooking."], "B"),
        ("part5-text", source(p5_question, p5_options, 5), [], p5_question, p5_options, "B"),
        ("part6-full-context", source(p6_question, p6_options, 6,
         "The trainer's Friday flight was canceled. The office opens at nine. Lunch is at noon. "
         "The meeting room has twenty chairs. Registration remains open. The trainer can arrive only on Monday."),
         [], p6_question, p6_options, "A"),
        ("part3-transcript-first", source("Questions 53 through 55 refer to the following conversation.\n"
         "(M-Cn) The warehouse ran out of the small food containers you ordered. We will deliver them tomorrow.\n"
         "(W-Am) Sales are slow today, so we can wait.\n\n" + p3_question, p3_options, 3),
         [], p3_question, p3_options, "C"),
        ("part7-context-images", source(QUESTION, OPTIONS, 7), [image_url(paths[0]), image_url(paths[1])],
         QUESTION, OPTIONS, "C"),
        ("part7-context-with-other-question", source(QUESTION, OPTIONS, 7), [image_url(paths[0]), image_url(paths[2])],
         QUESTION, OPTIONS, "C"),
    ]
    cases = [case for case in cases if case[0].startswith(prefix)]
    if not cases:
        raise SystemExit("No evaluation cases match the prefix.")
    results, usage = [], []

    async def tokens(response):
        await response.aread()
        if response.is_success:
            value = response.json().get("usage", {})
            usage.append({key: value[key] for key in ("input_tokens", "output_tokens") if isinstance(value.get(key), int)})

    async with httpx.AsyncClient(event_hooks={"response": [tokens]}) as client:
        provider = OpenAIProvider(settings, client)
        for name, fields, images, expected_question, expected_options, expected_letter in cases:
            print("Evaluating " + name, flush=True)
            # Validate the exact incoming contract and image bounds before any paid request.
            request = ExtractRequest.model_validate({"text": json.dumps(fields, ensure_ascii=False),
                "input": fields, "images": [{"dataUrl": image} for image in images], "provider": "openai", "consent": True,
                "request_id": "22222222-2222-4222-8222-222222222222"})
            try:
                result = await provider.generate(request.input.as_text(), source_options=fields["options"] or None,
                                                 source_answer="", images=images)
            except HTTPException as error:
                results.append({"case": name, "passed": False, "http_status": error.status_code, "error": error.detail})
                break  # No automatic retry or additional billed request after service failure.
            passed = matches(result.model_dump(), expected_question, expected_options, expected_letter)
            results.append({"case": name, "passed": passed, "draft": result.model_dump()})
            print(name + (": PASS" if passed else ": FAIL"), flush=True)
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps({"model": settings.openai_model, "requests": len(usage), "usage": usage,
                                "results": results}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"completed": len(results), "passed": sum(result["passed"] for result in results), "report": str(report)}))
    if len(results) != len(cases) or not all(result["passed"] for result in results):
        raise SystemExit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--case-prefix", default="", help="Run only matching fixture cases; no extra calls.")
    parser.add_argument("--report", type=Path, default=ROOT / "scratch/part7-live-evaluation.json")
    arguments = parser.parse_args()
    paths = fixtures()
    if arguments.prepare_only:
        print("Authored Part 7 image fixtures prepared; no OpenAI request.")
    else:
        asyncio.run(evaluate(paths, arguments.report, arguments.case_prefix))

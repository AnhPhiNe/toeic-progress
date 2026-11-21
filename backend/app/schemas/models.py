import json
import re
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, ClassVar, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.image_input import (
    MAX_DATA_URL_LENGTH,
    MAX_PAGE_DATA_URL_LENGTH,
    MAX_PAGE_IMAGE_BYTES,
    MAX_PAGE_TOTAL_BYTES,
    MAX_TOTAL_IMAGE_BYTES,
    image_bytes,
)
from app.core.text_input import has_multiple_questions

Number = Annotated[float, Field(ge=0, allow_inf_nan=False)]
Part = Annotated[int, Field(ge=1, le=7, strict=True)]
QuestionNumber = Annotated[int, Field(ge=1, le=200, strict=True)]
# Last question number of each Part in a TOEIC Listening & Reading test.
PART_LAST_QUESTION = (6, 31, 70, 100, 130, 146, 200)


def part_of_question(number: int) -> int:
    return next(index + 1 for index, last in enumerate(PART_LAST_QUESTION) if number <= last)
Category = Literal[
    "VOCABULARY_TRAP", "ADVANCED_GRAMMAR", "LISTENING_SPEED", "TIME_PRESSURE", "CARELESS_DISTRACTION", "OTHER"
]
AnswerSource = Literal["PROVIDED", "AI_PROPOSED", "MISSING"]
UserChoice = Literal["A", "B", "C", "D", ""]
PartOfSpeech = Literal["n", "v", "adj", "adv", "prep", "conj", "pron", "det", ""]


class Payload(BaseModel):
    model_config = ConfigDict(extra="allow", allow_inf_nan=False, strict=True)


class Profile(Payload):
    name: str = Field(min_length=1, max_length=100)
    targetScore: int = Field(ge=10, le=990, strict=True)
    examDate: date | Literal[""]
    selectedSkill: Literal["LR", "SW"]
    dailyMinGoalMinutes: int = Field(ge=1, le=1440, strict=True)
    streakFreezes: int = Field(ge=0, le=5, strict=True)
    currentStreak: int = Field(default=0, ge=0)
    longestStreak: int = Field(default=0, ge=0)
    lastStudyDate: date | Literal[""] = ""
    shieldAllowance: int | None = Field(default=None, ge=0)
    motto: str = Field(default="", max_length=2000)


class PracticePart(BaseModel):
    part: Part
    correct: int = Field(ge=0, strict=True)
    total: int = Field(ge=1, strict=True)

    @model_validator(mode="after")
    def check_counts(self):
        maximum = [6, 25, 39, 30, 30, 16, 54][self.part - 1]
        if self.correct > self.total or self.total > maximum:
            raise ValueError("Số câu đúng/tổng câu không hợp lệ")
        return self


class PartScores(BaseModel):
    part1: int = Field(ge=0, le=6, strict=True)
    part2: int = Field(ge=0, le=25, strict=True)
    part3: int = Field(ge=0, le=39, strict=True)
    part4: int = Field(ge=0, le=30, strict=True)
    part5: int = Field(ge=0, le=30, strict=True)
    part6: int = Field(ge=0, le=16, strict=True)
    part7: int = Field(ge=0, le=54, strict=True)


ElapsedSeconds = Annotated[int, Field(ge=0, le=86400, strict=True)]


class ResultTimingParts(BaseModel):
    model_config = ConfigDict(extra="forbid")
    part1: ElapsedSeconds | None = None
    part2: ElapsedSeconds | None = None
    part3: ElapsedSeconds | None = None
    part4: ElapsedSeconds | None = None
    part5: ElapsedSeconds | None = None
    part6: ElapsedSeconds | None = None
    part7: ElapsedSeconds | None = None


class ResultTiming(BaseModel):
    model_config = ConfigDict(extra="forbid")
    totalSeconds: ElapsedSeconds | None = None
    listeningSeconds: ElapsedSeconds | None = None
    readingSeconds: ElapsedSeconds | None = None
    parts: ResultTimingParts = Field(default_factory=ResultTimingParts)


class ConfirmedResultTiming(ResultTiming):
    source: Literal["IMAGE_CONFIRMED"]

    @model_validator(mode="after")
    def has_elapsed_value(self):
        if all(value is None for value in (self.totalSeconds, self.listeningSeconds, self.readingSeconds,
                                           *self.parts.model_dump().values())):
            raise ValueError("Chưa có thời gian đã làm để xác nhận")
        return self


class Session(Payload):
    id: str
    skillType: Literal["LR", "SW"]
    sessionType: Literal["FULL_TEST", "PART_PRACTICE"]
    testName: str = Field(min_length=1, max_length=300)
    date: date
    durationMinutes: float = Field(ge=0, le=1440)
    createdAt: AwareDatetime
    rawListening: int | None = Field(default=None, ge=0, le=100)
    rawReading: int | None = Field(default=None, ge=0, le=100)
    scaledListening: int | None = Field(default=None, ge=0, le=495)
    scaledReading: int | None = Field(default=None, ge=0, le=495)
    totalScore: int | None = Field(default=None, ge=0, le=990)
    partScores: PartScores | None = None
    practiceParts: list[PracticePart] | None = Field(default=None, max_length=7)
    notes: str | None = Field(default=None, max_length=16000)
    attemptNumber: int | None = Field(default=None, ge=1)
    scoreSource: Literal["ESTIMATED", "MANUAL_SECTIONS", "MANUAL_TOTAL"] | None = None
    scoreConversionVersion: str | None = Field(default=None, max_length=100)
    wrongQuestions: list[QuestionNumber] | None = Field(default=None, max_length=200)
    resultTiming: ConfirmedResultTiming | None = None

    @model_validator(mode="after")
    def check_score_source(self):
        if self.resultTiming is not None and self.sessionType != "FULL_TEST":
            raise ValueError("Thời gian từ ảnh kết quả chỉ dùng cho Full Test")
        if self.wrongQuestions is not None:
            if self.sessionType != "FULL_TEST":
                raise ValueError("Danh sách câu sai chỉ dùng cho Full Test")
            if any(b <= a for a, b in zip(self.wrongQuestions, self.wrongQuestions[1:], strict=False)):
                raise ValueError("Danh sách câu sai phải tăng dần, không trùng")
            if self.partScores is not None:
                wrong = [0] * 7
                for number in self.wrongQuestions:
                    wrong[part_of_question(number) - 1] += 1
                sizes = [6, 25, 39, 30, 30, 16, 54]
                if [getattr(self.partScores, f"part{index + 1}") for index in range(7)] != [size - count for size, count in zip(sizes, wrong, strict=True)]:
                    raise ValueError("Số câu đúng từng Part không khớp danh sách câu sai")
        if self.practiceParts is not None and len({item.part for item in self.practiceParts}) != len(self.practiceParts):
            raise ValueError("Part luyện tập bị trùng")
        # Preserve legacy imports without changing or re-estimating their scores.
        if self.scoreSource is None:
            return self
        if self.sessionType != "FULL_TEST":
            raise ValueError("Nguồn điểm chỉ áp dụng cho bài Full Test")
        if self.totalScore is None or not 10 <= self.totalScore <= 990 or self.totalScore % 5:
            raise ValueError("Tổng điểm phải từ 10 đến 990 theo bước 5")
        if self.scoreSource == "MANUAL_TOTAL":
            if self.scaledListening is not None or self.scaledReading is not None:
                raise ValueError("Chỉ nhập tổng thì không được suy ra điểm kỹ năng")
        else:
            scores = [self.scaledListening, self.scaledReading]
            if any(value is None or not 5 <= value <= 495 or value % 5 for value in scores):
                raise ValueError("Điểm kỹ năng phải từ 5 đến 495 theo bước 5")
            if self.totalScore != self.scaledListening + self.scaledReading:
                raise ValueError("Tổng điểm phải bằng Listening cộng Reading")
            if self.scoreSource == "ESTIMATED" and self.partScores is None:
                raise ValueError("Cần số câu đúng từng Part khi ước tính")
        return self


SourceImageId = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$", min_length=64, max_length=64)]


class Mistake(Payload):
    id: str
    part: Part
    questionNumber: QuestionNumber | None = None
    category: Category
    status: Literal["NEEDS_REVIEW", "MASTERED"]
    questionContext: str = Field(max_length=16000)
    question: str | None = Field(default=None, max_length=16000)
    context: str | None = Field(default=None, max_length=16000)
    sourceImageIds: list[SourceImageId] = Field(default_factory=list, max_length=3)
    userMistake: str = Field(max_length=4000)
    correctAnswer: str = Field(max_length=2000)
    answerSource: AnswerSource | None = None
    userChoice: Literal["A", "B", "C", "D"] | None = None
    userChoiceState: Literal["CHOSEN", "UNKNOWN", "BLANK"] | None = None
    userReason: str | None = Field(default=None, max_length=2000)
    answerProvidedBy: Literal["SOURCE", "LEARNER"] | None = None
    tags: list[Annotated[str, Field(max_length=80)]] = Field(max_length=20)
    options: list[Annotated[str, Field(max_length=2000)]] | None = Field(default=None, max_length=4)
    createdAt: AwareDatetime
    nextReviewDate: date | None = None
    sessionId: str | None = Field(default=None, max_length=200)
    sourceTestName: str | None = Field(default=None, max_length=300)
    trapTip: str | None = Field(default=None, max_length=4000)
    reviewStage: int | None = Field(default=None, ge=0)
    reviewCount: int | None = Field(default=None, ge=0)
    lastReviewedAt: AwareDatetime | None = None

    @field_validator("lastReviewedAt", mode="before")
    @classmethod
    def accept_legacy_review_date(cls, value):
        if isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            return datetime.fromisoformat(date.fromisoformat(value).isoformat() + "T00:00:00+00:00")
        if isinstance(value, str):
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        return value

    @model_validator(mode="after")
    def check_learner_choice(self):
        if self.questionNumber is not None and part_of_question(self.questionNumber) != self.part:
            raise ValueError("Số câu không thuộc Part đã chọn")
        if self.sourceImageIds and (self.part not in (1, 7) or (self.part == 1 and len(self.sourceImageIds) != 1)
                                    or len(set(self.sourceImageIds)) != len(self.sourceImageIds)):
            raise ValueError("Ảnh nguồn chỉ dùng cho Part 1 (một ảnh) hoặc Part 7")
        if self.userChoiceState is None:
            match = re.match(r"^\s*\(([A-D])\)", self.userMistake, re.IGNORECASE)
            self.userChoice = self.userChoice or (match[1].upper() if match else None)
            self.userChoiceState = "CHOSEN" if self.userChoice else "UNKNOWN"
        elif self.userChoiceState == "CHOSEN" and self.userChoice is None:
            raise ValueError("Cần phương án người học đã chọn")
        elif self.userChoiceState != "CHOSEN" and self.userChoice is not None:
            raise ValueError("Không nhớ/bỏ trống không có phương án đã chọn")
        return self


class PacingPhase(Payload):
    name: str = Field(max_length=200)
    plannedMinutes: Number
    actualMinutes: Number
    overrunMinutes: float


class Pacing(Payload):
    id: str
    presetId: str
    presetName: str
    date: date
    plannedMinutes: Number
    actualMinutes: Number
    finishedNaturally: bool
    phases: list[PacingPhase] = Field(max_length=100)
    createdAt: AwareDatetime
    partType: Literal["PART_5", "PART_6", "PART_7", "PART_7_SINGLE", "PART_7_MULTI", "FULL_READING", "POMODORO", "CUSTOM"] | None = None
    testName: str | None = Field(default=None, max_length=300)
    totalQuestions: int | None = Field(default=None, ge=1, le=100, strict=True)
    correctAnswers: int | None = Field(default=None, ge=0, le=100, strict=True)
    actualSeconds: Number | None = None
    speedSecPerQuestion: Number | None = None
    accuracyPercent: float | None = Field(default=None, ge=0, le=100)

    @field_validator("partType", "testName", "totalQuestions", "correctAnswers", "actualSeconds", "speedSecPerQuestion", "accuracyPercent", mode="before")
    @classmethod
    def reject_explicit_null(cls, value):
        if value is None:
            raise ValueError("Trường luyện tốc độ đã cung cấp không được để null")
        return value

    @model_validator(mode="after")
    def check_result(self):
        # Older runs may omit these fields or use a custom question count.
        if self.correctAnswers is not None and (self.totalQuestions is None or self.correctAnswers > self.totalQuestions):
            raise ValueError("Số câu đúng phải có tổng câu và không vượt tổng câu")
        return self


class Vocabulary(Payload):
    id: str
    date: date
    count: int = Field(ge=1, le=10000, strict=True)
    sourceName: str | None = Field(default=None, max_length=300)
    parts: list[Part] | None = Field(default=None, max_length=7)

    @field_validator("parts")
    @classmethod
    def distinct_parts(cls, value):
        if value is not None and len(set(value)) != len(value):
            raise ValueError("Part từ vựng bị trùng")
        return value


class Shield(Payload):
    id: str
    date: date


PAYLOAD_MODELS = {
    "profile": Profile,
    "sessions": Session,
    "mistakes": Mistake,
    "pacingRuns": Pacing,
    "vocabLog": Vocabulary,
    "shieldDays": Shield,
}
# Weekly plans and the exam checklist have no screen any more. Apps from before
# the change may still send them: they are accepted here and dropped, never stored.
RETIRED_ENTITY_TYPES = frozenset({"checklist", "weeklyPlans"})


class SyncRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")
    entity_type: Literal[
        "profile", "sessions", "mistakes", "pacingRuns", "checklist", "vocabLog", "shieldDays", "weeklyPlans"
    ]
    record_id: str = Field(min_length=1, max_length=200)
    payload: dict
    updated_at: datetime
    deleted_at: datetime | None

    @model_validator(mode="after")
    def check_payload(self):
        if len(json.dumps(self.payload, ensure_ascii=False).encode()) > 32768:
            raise ValueError("Bản ghi quá lớn")
        if self.entity_type == "profile":
            if self.record_id != "profile" or self.deleted_at is not None:
                raise ValueError("Khóa hồ sơ không hợp lệ")
        elif self.payload.get("id") != self.record_id:
            raise ValueError("ID nội dung không khớp bản ghi")
        if self.deleted_at is not None:
            self.payload = {"id": self.record_id}
        elif self.entity_type not in RETIRED_ENTITY_TYPES:
            validated = PAYLOAD_MODELS[self.entity_type].model_validate_json(json.dumps(self.payload))
            self.payload = validated.model_dump(mode="json", exclude_none=True)
            if isinstance(validated, Session) and validated.resultTiming is not None:
                # Null scope is meaningful: it is unknown, never zero. Keep the
                # canonical shape so backups and older clients round-trip it.
                self.payload["resultTiming"] = validated.resultTiming.model_dump()
        if self.updated_at.tzinfo is None or (self.deleted_at and self.deleted_at.tzinfo is None):
            raise ValueError("Thời điểm đồng bộ phải có múi giờ")
        if self.updated_at > datetime.now(timezone.utc) + timedelta(minutes=5):
            raise ValueError("Kiểm tra lại đồng hồ thiết bị trước khi đồng bộ")
        return self


class SyncRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    records: list[SyncRecord] = Field(default_factory=list, max_length=10000)
    cursor: int = Field(default=0, ge=0, le=9007199254740991, strict=True)
    replace: bool = False

    @model_validator(mode="after")
    def distinct_records(self):
        identities = {(record.entity_type, record.record_id) for record in self.records}
        if len(identities) != len(self.records):
            raise ValueError("ID bị trùng trong yêu cầu")
        if self.replace and ("profile", "profile") not in identities:
            raise ValueError("Thay thế dữ liệu phải bao gồm hồ sơ")
        self.records = [record for record in self.records if record.entity_type not in RETIRED_ENTITY_TYPES]
        return self


class MistakeInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    max_analysis_length: ClassVar[int] = 8000
    question: str = Field(default="", max_length=4000)
    options: list[Annotated[str, Field(min_length=1, max_length=1000)]] = Field(default_factory=list, max_length=4)
    rawText: str | None = Field(default=None, min_length=1, max_length=8000)
    context: str = Field(default="", max_length=8000)
    part: Part
    userChoiceState: Literal["CHOSEN", "UNKNOWN", "BLANK"]
    userChoice: UserChoice = ""
    userReason: str = Field(default="", max_length=2000)
    sourceAnswer: UserChoice = ""
    errorCategory: Category | None = None

    @model_validator(mode="after")
    def check_input(self):
        if self.rawText is not None:
            if not self.rawText.strip() or self.question or self.options:
                raise ValueError("Nội dung dán tự do không kèm câu hỏi/phương án đã tách")
            if self.userChoiceState != "CHOSEN" and self.userChoice:
                raise ValueError("Không nhớ/bỏ trống không có phương án đã chọn")
            if self.userChoiceState == "CHOSEN" and not self.userChoice:
                raise ValueError("Cần phương án đã chọn")
            if self.part == 2 and (self.userChoice == "D" or self.sourceAnswer == "D"):
                raise ValueError("Part 2 chỉ có A–C")
            if len(self.as_text()) > self.max_analysis_length:
                raise ValueError(f"Nội dung phân tích tối đa {self.max_analysis_length} ký tự")
            return self
        labels = []
        for option in self.options:
            match = re.match(r"^\(([A-D])\)\s+\S", option)
            if not match:
                raise ValueError("Phương án cần nhãn A-D và nội dung")
            labels.append(match[1])
        if labels != list("ABCD"[:len(labels)]) or (self.part == 2 and len(labels) > 3):
            raise ValueError("Phương án cần theo thứ tự A-D; Part 2 chỉ có A-C")
        if self.part == 1 and len(labels) != 4:
            raise ValueError("Part 1 cần đủ bốn phương án A–D")
        if self.userChoiceState == "CHOSEN" and self.userChoice not in labels:
            raise ValueError("Lựa chọn chưa khớp phương án")
        if self.userChoiceState != "CHOSEN" and self.userChoice:
            raise ValueError("Không nhớ/bỏ trống không có phương án đã chọn")
        if self.sourceAnswer and self.sourceAnswer not in labels:
            raise ValueError("Đáp án nguồn chưa khớp phương án")
        if len(labels) < 2 or not self.question.strip() or has_multiple_questions(self.question + "\n" + self.context):
            raise ValueError("Mỗi lần nhập một câu hỏi")
        if len(self.as_text()) > self.max_analysis_length:
            raise ValueError(f"Nội dung phân tích tối đa {self.max_analysis_length} ký tự")
        return self

    def as_text(self) -> str:
        return json.dumps(self.model_dump(), ensure_ascii=False, separators=(",", ":"))


class ImageAttachment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dataUrl: str = Field(max_length=MAX_DATA_URL_LENGTH, repr=False)

    @field_validator("dataUrl")
    @classmethod
    def validate_image(cls, value):
        image_bytes(value)
        return value

    @property
    def byte_count(self) -> int:
        encoded = self.dataUrl.split(",", 1)[1]
        return len(encoded) * 3 // 4 - (len(encoded) - len(encoded.rstrip("=")))


class SourceImageIds(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    sourceImageIds: list[SourceImageId] = Field(min_length=1, max_length=3)

    @model_validator(mode="after")
    def distinct_images(self):
        if len(set(self.sourceImageIds)) != len(self.sourceImageIds):
            raise ValueError("Ảnh nguồn bị trùng")
        return self


class UploadSourceImages(BaseModel):
    model_config = ConfigDict(extra="forbid")
    images: list[ImageAttachment] = Field(min_length=1, max_length=3, repr=False)

    @model_validator(mode="after")
    def total_bytes(self):
        if sum(image.byte_count for image in self.images) > MAX_TOTAL_IMAGE_BYTES:
            raise ValueError("Tổng ảnh gửi đi tối đa 2 MiB")
        return self


class CleanupSourceImages(BaseModel):
    model_config = ConfigDict(extra="forbid")
    before: AwareDatetime


class ExtractRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(max_length=8000)
    request_id: UUID
    consent: Literal[True]
    provider: Literal["openai"]
    captcha_token: str | None = Field(default=None, max_length=2048)
    input: MistakeInput | None = None
    images: list[ImageAttachment] = Field(default_factory=list, max_length=3, repr=False)
    sourceImageIds: list[SourceImageId] = Field(default_factory=list, max_length=3)

    @model_validator(mode="after")
    def single_question(self):
        if len(set(self.sourceImageIds)) != len(self.sourceImageIds):
            raise ValueError("Ảnh nguồn bị trùng")
        if self.images and self.sourceImageIds:
            raise ValueError("Chỉ dùng một bộ ảnh nguồn trong mỗi yêu cầu")
        if self.input is not None and self.input.part == 1 and not (self.images or self.sourceImageIds):
            raise ValueError("Cần ảnh tranh để phân tích Part 1")
        if self.images or self.sourceImageIds:
            if self.input is None or self.input.part not in (1, 7):
                raise ValueError("Ảnh chỉ hỗ trợ Part 1/7 với input có cấu trúc")
            if self.input.part == 1 and len(self.images or self.sourceImageIds) != 1:
                raise ValueError("Mỗi câu Part 1 dùng một ảnh tranh")
            if self.input.rawText is None and len(self.input.options) != 4:
                raise ValueError("Dán đủ bốn phương án A–D; ảnh chỉ cung cấp ngữ cảnh")
            if sum(image.byte_count for image in self.images) > MAX_TOTAL_IMAGE_BYTES:
                raise ValueError("Tổng ảnh gửi đi tối đa 2 MiB")
        else:
            if len(self.text.strip()) < 20:
                raise ValueError("Nội dung tối thiểu 20 ký tự")
            if self.input is not None and self.input.rawText is None and (not self.input.question.strip() or len(self.input.options) < 2):
                raise ValueError("Cần câu hỏi và ít nhất hai phương án")
        if self.input is None and has_multiple_questions(self.text):
            raise ValueError("Mỗi lần nhập một câu hỏi")
        return self


class ResetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirm: Literal[True]


class OptionNote(BaseModel):
    """Meaning of one answer option. pos is an English abbreviation, '' for phrases and sentences."""

    model_config = ConfigDict(extra="forbid")
    label: Literal["A", "B", "C", "D"]
    pos: PartOfSpeech
    meaning: str = Field(max_length=120)


class Explanation(BaseModel):
    """Explanation sections; a section that does not apply is ''."""

    model_config = ConfigDict(extra="forbid")
    quickTip: str = Field(max_length=400)
    translation: str = Field(max_length=600)
    questionType: str = Field(max_length=300)
    evidence: str = Field(max_length=800)
    paraphrase: str = Field(max_length=400)
    analysis: str = Field(max_length=1200)
    keyVocabulary: str = Field(max_length=400)


EXPLANATION_LABELS = (
    ("translation", "Dịch ngữ cảnh"), ("questionType", "Dạng câu hỏi"), ("evidence", "Bằng chứng"),
    ("paraphrase", "Paraphrase"), ("analysis", "Phân tích"), ("keyVocabulary", "Từ vựng"), ("quickTip", "Mẹo 10s"),
)


class DraftCore(BaseModel):
    model_config = ConfigDict(extra="forbid")
    part: Part | None
    category: Category
    questionContext: str = Field(min_length=1, max_length=4000)
    # Optional only for older cached/provider drafts; new provider schemas require
    # these fields. questionContext is composed by the API for older clients.
    question: str | None = Field(default=None, max_length=4000)
    context: str | None = Field(default=None, max_length=4000)
    userMistake: str = Field(max_length=2000)
    correctAnswer: str = Field(max_length=1000)
    options: list[Annotated[str, Field(max_length=1000)]] = Field(max_length=4)
    tags: list[Annotated[str, Field(max_length=50)]] = Field(max_length=5)
    missingInformation: list[Annotated[str, Field(max_length=300)]] = Field(max_length=8)
    answerSource: AnswerSource
    # Older drafts may omit the learner's choice; new OpenAI output requires it.
    userChoice: UserChoice = ""

    @model_validator(mode="before")
    @classmethod
    def compose_question_context(cls, value):
        if isinstance(value, dict) and isinstance(value.get("question"), str) and isinstance(value.get("context"), str):
            value = {**value, "questionContext": "\n\n".join(
                field.strip() for field in (value["question"], value["context"]) if field.strip()
            )}
        return value

    @classmethod
    def ai_schema(cls) -> dict:
        schema = cls.model_json_schema()
        properties = schema["properties"]
        properties.pop("questionContext")
        for name in ("question", "context"):
            properties[name] = {"type": "string", "maxLength": 4000}
        schema["required"] = list(properties)
        return schema

    @model_validator(mode="after")
    def clear_missing_answer(self):
        if self.answerSource == "MISSING":
            self.correctAnswer = ""
        return self


class MistakeDraft(DraftCore):
    """Draft returned to the app. trapTip is plain text for older clients, search and backups."""

    trapTip: str = Field(max_length=4000)
    # The option AI judged correct when it differs from the source's answer, so the learner can check the source.
    answerDoubt: Literal["", "A", "B", "C", "D"] = ""
    optionNotes: list[OptionNote] = Field(default_factory=list, max_length=4)
    explanation: Explanation | None = None

    def compose_trap_tip(self) -> None:
        """Write trapTip from structured sections; older drafts keep their existing text."""
        if self.explanation is None:
            return
        notes = "; ".join(
            f"({note.label}) ({note.pos}) {note.meaning}" if note.pos else f"({note.label}) {note.meaning}"
            for note in self.optionNotes if note.meaning.strip()
        )
        sections = []
        for key, label in EXPLANATION_LABELS:
            if key == "analysis" and notes:
                sections.append(f"Phương án: {notes}")
            value = getattr(self.explanation, key).strip()
            if value:
                sections.append(f"{label}: {value}")
        text = "\n\n".join(sections)
        if len(text) > 4000:
            # Structured sections remain intact; only the legacy text is shortened.
            marker = "\n\n[Đã rút gọn; xem giải thích chi tiết.]"
            kept = []
            for section in sections:
                if len("\n\n".join([*kept, section])) > 4000 - len(marker):
                    break
                kept.append(section)
            text = "\n\n".join(kept) + marker
        self.trapTip = text


class OpenAIDraftOutput(DraftCore):
    """OpenAI strict structured output: every property is required."""

    userChoice: UserChoice
    optionNotes: list[OptionNote] = Field(max_length=4)
    explanation: Explanation
    # AI's own answer from the question alone; compared with the source answer, never shown as the answer itself.
    ownAnswer: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def check_option_notes(self):
        """New AI output must explain each labeled option; legacy saved drafts remain readable."""
        labels = []
        for option in self.options:
            match = re.match(r"^\s*\(([A-D])\)\s*\S", option, re.IGNORECASE)
            if not match:
                raise ValueError("AI options must have an A-D label and nonempty text")
            labels.append(match[1].upper())
        if len(labels) != len(set(labels)):
            raise ValueError("AI option labels must be unique")
        note_labels = [note.label for note in self.optionNotes]
        if len(note_labels) != len(set(note_labels)) or set(note_labels) != set(labels):
            raise ValueError("Each AI option must have exactly one meaning")
        if any(not note.meaning.strip() for note in self.optionNotes):
            raise ValueError("AI option meanings must not be blank")
        return self

    def to_draft(self) -> MistakeDraft:
        draft = MistakeDraft(**self.model_dump(exclude={"ownAnswer"}), trapTip="")
        draft.compose_trap_tip()
        return draft


class OpenAIPasteOutput(OpenAIDraftOutput):
    inputIssue: Literal["", "MULTIPLE_QUESTIONS", "MISSING_QUESTION", "MISSING_OPTIONS"]

    @classmethod
    def ai_schema(cls) -> dict:
        schema = super().ai_schema()
        # The generation contract constrains output formatting; users can
        # still paste any supported source label style in rawText.
        schema["properties"]["options"]["items"]["pattern"] = r"^\([A-D]\) .+"
        return schema

    @model_validator(mode="before")
    @classmethod
    def normalize_extracted_option_labels(cls, value):
        if not isinstance(value, dict) or not isinstance(value.get("options"), list):
            return value
        options = []
        for option in value["options"]:
            match = re.match(r"^\s*(?:\(([A-D])\)|([A-D])[.):\-])\s*(\S.*)$", option,
                             re.IGNORECASE | re.DOTALL) if isinstance(option, str) else None
            # Change only an explicit label's punctuation/case. Never assign
            # letters by array position or alter the answer text.
            options.append(f"({(match[1] or match[2]).upper()}) {match[3].strip()}" if match else option)
        return {**value, "options": options}

    @model_validator(mode="before")
    @classmethod
    def issue_without_a_question(cls, value):
        # An issue is reported before creating a draft; permit an empty stem.
        if isinstance(value, dict) and value.get("inputIssue") and not value.get("question"):
            return {**value, "questionContext": "Chưa tách được câu hỏi", "question": None}
        return value

    def to_draft(self) -> MistakeDraft:
        draft = MistakeDraft(**self.model_dump(exclude={"inputIssue", "ownAnswer"}), trapTip="")
        draft.compose_trap_tip()
        return draft


class PageMistakeDraft(MistakeDraft):
    """Screenshot passages stay complete; ordinary single-question limits stay unchanged."""

    questionContext: str = Field(min_length=1, max_length=12002)
    context: str | None = Field(default=None, max_length=8000)


class OpenAIPageExplanationOutput(OpenAIDraftOutput):
    questionContext: str = Field(min_length=1, max_length=12002)
    context: str | None = Field(default=None, max_length=8000)

    @classmethod
    def ai_schema(cls) -> dict:
        schema = super().ai_schema()
        schema["properties"]["context"] = {"type": "string", "maxLength": 8000}
        return schema

    def to_draft(self) -> PageMistakeDraft:
        draft = PageMistakeDraft(**self.model_dump(exclude={"ownAnswer"}), trapTip="")
        draft.compose_trap_tip()
        return draft


MAX_PAGE_ITEMS = 6
# One request reads one question group: up to 6 question images plus up to 5 passage/transcript pages.
MAX_PAGE_IMAGES = 6
MAX_PAGE_CONTEXT_IMAGES = 5


class PageImageAttachment(BaseModel):
    """A test-page screenshot, usually sent as it is: larger than the single-question attachments."""

    model_config = ConfigDict(extra="forbid")
    dataUrl: str = Field(max_length=MAX_PAGE_DATA_URL_LENGTH, repr=False)

    @field_validator("dataUrl")
    @classmethod
    def validate_image(cls, value):
        image_bytes(value, MAX_PAGE_IMAGE_BYTES)
        return value

    @property
    def byte_count(self) -> int:
        encoded = self.dataUrl.split(",", 1)[1]
        return len(encoded) * 3 // 4 - (len(encoded) - len(encoded.rstrip("=")))


class PageQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    number: QuestionNumber
    part: Part

    @model_validator(mode="after")
    def number_in_part(self):
        if part_of_question(self.number) != self.part:
            raise ValueError("Số câu không thuộc Part đã chọn")
        return self


class PageExtractRequest(BaseModel):
    """Screenshots of an on-screen test and the learner's wrong questions to look for in them."""

    model_config = ConfigDict(extra="forbid")
    request_id: UUID
    consent: Literal[True]
    provider: Literal["openai"]
    captcha_token: str | None = Field(default=None, max_length=2048)
    # One capture sends a request per question group. They share a batch id and count as one AI use.
    batch_id: UUID | None = None
    questions: list[PageQuestion] = Field(min_length=1, max_length=200)
    images: list[PageImageAttachment] = Field(min_length=1, max_length=MAX_PAGE_IMAGES, repr=False)
    # Part 3/4/6/7: optional passage/transcript pages sent with question images so both are read together.
    context_images: list[PageImageAttachment] = Field(default_factory=list, max_length=MAX_PAGE_CONTEXT_IMAGES, repr=False)
    # A tall screenshot cut into consecutive parts: [first, last] positions (1-based, passage images first, then
    # question images) of each run, so the reading joins them back into one page.
    slices: list[tuple[int, int]] = Field(default_factory=list, max_length=MAX_PAGE_IMAGES + MAX_PAGE_CONTEXT_IMAGES)
    # True when learner marks photos as paper book/hand-graded pages (routes to paper OCR model & effort).
    photoMode: bool = False

    @model_validator(mode="after")
    def check_page(self):
        numbers = [question.number for question in self.questions]
        if len(set(numbers)) != len(numbers):
            raise ValueError("Số câu bị trùng")
        total = len(self.context_images) + len(self.images)
        taken: set[int] = set()
        for first, last in self.slices:
            run = set(range(first, last + 1))
            if first < 1 or last > total or last <= first or run & taken:
                raise ValueError("Các phần cắt của ảnh không hợp lệ")
            if (first <= len(self.context_images)) != (last <= len(self.context_images)):
                raise ValueError("Các phần cắt của ảnh không hợp lệ")
            taken |= run
        if self.context_images and any(question.part not in (3, 4, 6, 7) for question in self.questions):
            raise ValueError("Ảnh ngữ cảnh chỉ dùng cho Part 3–4 hoặc Part 6–7")
        if sum(image.byte_count for image in [*self.context_images, *self.images]) > MAX_PAGE_TOTAL_BYTES:
            raise ValueError("Tổng ảnh gửi đi tối đa 8 MiB")
        return self


class OpenAIPageItem(BaseModel):
    """One wrong question copied from the screenshots. No explanation: that is written later, on request."""

    model_config = ConfigDict(extra="forbid")
    number: int
    question: str = Field(max_length=4000)
    # Never shorten a passage silently: an oversized item is reported as missing.
    context: str = Field(max_length=8000)
    options: list[Annotated[str, Field(max_length=1000)]] = Field(max_length=4)
    userChoice: UserChoice
    correctAnswer: str = Field(max_length=1000)
    answerSource: Literal["PROVIDED", "MISSING"]


def page_output_schema(numbers: list[int]) -> dict:
    """Strict schema for a page: up to MAX_PAGE_ITEMS questions, each numbered from the requested list."""
    item = OpenAIPageItem.model_json_schema()
    item.pop("title", None)
    item["properties"]["number"] = {"type": "integer", "enum": sorted(numbers)}
    item["required"] = list(item["properties"])
    return {
        "type": "object", "additionalProperties": False, "required": ["items"],
        "properties": {"items": {"type": "array", "items": item, "maxItems": MAX_PAGE_ITEMS}},
    }


class OpenAIPageOutput(BaseModel):
    """Items stay raw here: each is checked on its own, so one unreadable question does not lose the others."""

    model_config = ConfigDict(extra="forbid")
    items: list[dict] = Field(max_length=MAX_PAGE_ITEMS)


MAX_RESULT_IMAGES = 8
# Base64 of 6 MiB plus the JSON envelope stays under the 10 MiB result-route body limit,
# keeping paper answer sheets sharp without forcing heavy 300 KB compression.
MAX_RESULT_IMAGE_BYTES = 6 * 1024 * 1024


class ResultsReadRequest(BaseModel):
    """Screenshots or paper photos of a test's result sheet (numbered questions marked right, wrong or skipped)."""

    model_config = ConfigDict(extra="forbid")
    request_id: UUID
    consent: Literal[True]
    provider: Literal["openai"]
    captcha_token: str | None = Field(default=None, max_length=2048)
    # A whole result page often takes several screenshots or sharp paper sheet photos; up to 8 images, 6 MiB total.
    images: list[PageImageAttachment] = Field(min_length=1, max_length=MAX_RESULT_IMAGES, repr=False)
    photoMode: bool = False

    @model_validator(mode="after")
    def total_bytes(self):
        if sum(image.byte_count for image in self.images) > MAX_RESULT_IMAGE_BYTES:
            raise ValueError("Tổng ảnh gửi đi tối đa 6 MiB")
        return self


QUESTION_LIST_SCHEMA = {"type": "array", "items": {"type": "integer", "minimum": 1, "maximum": 200}, "maxItems": 200}
ELAPSED_SECONDS_SCHEMA = {"type": ["integer", "null"], "minimum": 0, "maximum": 86400}
RESULT_TIMING_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["totalSeconds", "listeningSeconds", "readingSeconds", "parts"],
    "properties": {**{key: ELAPSED_SECONDS_SCHEMA.copy() for key in ("totalSeconds", "listeningSeconds", "readingSeconds")},
                   "parts": {"type": "object", "additionalProperties": False,
                             "required": [f"part{part}" for part in range(1, 8)],
                             "properties": {f"part{part}": ELAPSED_SECONDS_SCHEMA.copy() for part in range(1, 8)}}},
}
RESULTS_OUTPUT_SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["wrong", "skipped", "scores", "timing"],
    "properties": {"wrong": QUESTION_LIST_SCHEMA, "skipped": QUESTION_LIST_SCHEMA,
                   "timing": RESULT_TIMING_SCHEMA,
                   "scores": {"type": "object", "additionalProperties": False,
                              "required": ["listening", "reading", "total"],
                              "properties": {
                                  "listening": {"type": ["integer", "null"], "minimum": 5, "maximum": 495, "multipleOf": 5},
                                  "reading": {"type": ["integer", "null"], "minimum": 5, "maximum": 495, "multipleOf": 5},
                                  "total": {"type": ["integer", "null"], "minimum": 10, "maximum": 990, "multipleOf": 5}}}},
}


class ResultScores(BaseModel):
    model_config = ConfigDict(extra="forbid")
    listening: int | None = Field(default=None, strict=True, ge=5, le=495, multiple_of=5)
    reading: int | None = Field(default=None, strict=True, ge=5, le=495, multiple_of=5)
    total: int | None = Field(default=None, strict=True, ge=10, le=990, multiple_of=5)
    part5Minutes: int | None = Field(default=None, ge=1, le=75)
    part6Minutes: int | None = Field(default=None, ge=1, le=75)
    part7Minutes: int | None = Field(default=None, ge=1, le=75)


class OpenAIResultsOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    wrong: list[int] = Field(max_length=200)
    skipped: list[int] = Field(max_length=200)
    scores: ResultScores = Field(default_factory=ResultScores)
    timing: ResultTiming = Field(default_factory=ResultTiming)


class PageExplanationInput(MistakeInput):
    # Only signed screenshot follow-ups accept a full 8k passage plus the question,
    # options and learner metadata; ordinary extract/freeform limits remain 8k.
    # Existing per-field bounds limit real text to about 18k. Allow JSON's worst
    # case escaping without rejecting a valid 8k passage containing line breaks.
    max_analysis_length: ClassVar[int] = 120000


class ExplainItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    number: QuestionNumber
    input: PageExplanationInput

    @model_validator(mode="after")
    def written_question(self):
        if self.input.rawText is not None or part_of_question(self.number) != self.input.part or self.input.part == 1:
            raise ValueError("Chỉ giải thích câu đã đọc từ ảnh, đúng Part, có câu hỏi và phương án")
        return self


class ExplainBatchRequest(BaseModel):
    """Explanations for questions a screenshot reading already counted, authorised by its ticket."""

    model_config = ConfigDict(extra="forbid")
    request_id: UUID
    consent: Literal[True]
    provider: Literal["openai"]
    ticket: str = Field(min_length=20, max_length=2048)
    items: list[ExplainItem] = Field(min_length=1, max_length=MAX_PAGE_ITEMS)

    @model_validator(mode="after")
    def distinct_numbers(self):
        numbers = [item.number for item in self.items]
        if len(set(numbers)) != len(numbers):
            raise ValueError("Số câu bị trùng")
        return self

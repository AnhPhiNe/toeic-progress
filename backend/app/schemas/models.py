import json
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

Number = Annotated[float, Field(ge=0, allow_inf_nan=False)]
Part = Annotated[int, Field(ge=1, le=7, strict=True)]
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

    @model_validator(mode="after")
    def check_score_source(self):
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


class Mistake(Payload):
    id: str
    part: Part
    category: Category
    status: Literal["NEEDS_REVIEW", "MASTERED"]
    questionContext: str = Field(max_length=16000)
    userMistake: str = Field(max_length=4000)
    correctAnswer: str = Field(max_length=2000)
    answerSource: AnswerSource | None = None
    userChoice: Literal["A", "B", "C", "D"] | None = None
    tags: list[Annotated[str, Field(max_length=80)]] = Field(max_length=20)
    options: list[Annotated[str, Field(max_length=2000)]] | None = Field(default=None, max_length=4)
    createdAt: AwareDatetime
    nextReviewDate: date | None = None
    sessionId: str | None = Field(default=None, max_length=200)
    trapTip: str | None = Field(default=None, max_length=4000)
    reviewStage: int | None = Field(default=None, ge=0)
    reviewCount: int | None = Field(default=None, ge=0)
    lastReviewedAt: AwareDatetime | None = None


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


class Checklist(Payload):
    id: str
    checked: bool


class Vocabulary(Payload):
    id: str
    date: date
    count: int = Field(ge=1, le=10000, strict=True)


class Shield(Payload):
    id: str
    date: date


class WeeklyTask(Payload):
    id: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=300)
    type: Literal["AUTO_FULL_TEST", "AUTO_PART_PRACTICE", "AUTO_STUDY_TIME", "CUSTOM"]
    target: float = Field(gt=0, le=100000)
    unit: str = Field(min_length=1, max_length=50)
    createdAt: AwareDatetime
    partNumber: Part | None = None
    manualDone: Number | None = None
    isCompleted: bool | None = None
    notes: str | None = Field(default=None, max_length=4000)
    color: Literal["indigo", "blue", "amber", "sky", "rose", "purple"] | None = None


class WeeklyPlan(Payload):
    id: str
    weekKey: date
    tasks: list[WeeklyTask] = Field(max_length=100)

    @model_validator(mode="after")
    def check_identity(self):
        if self.id != self.weekKey.isoformat() or self.weekKey.weekday() != 0:
            raise ValueError("Kế hoạch phải dùng ngày thứ Hai làm ID tuần")
        if len({task.id for task in self.tasks}) != len(self.tasks):
            raise ValueError("ID mục tiêu bị trùng")
        return self


PAYLOAD_MODELS = {
    "profile": Profile,
    "sessions": Session,
    "mistakes": Mistake,
    "pacingRuns": Pacing,
    "checklist": Checklist,
    "vocabLog": Vocabulary,
    "shieldDays": Shield,
    "weeklyPlans": WeeklyPlan,
}


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
        else:
            self.payload = (
                PAYLOAD_MODELS[self.entity_type]
                .model_validate_json(json.dumps(self.payload))
                .model_dump(mode="json", exclude_none=True)
            )
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
        return self


class ExtractRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=20, max_length=8000)
    request_id: UUID
    consent: Literal[True]
    provider: Literal["gemini", "openai"] | None = None
    captcha_token: str | None = Field(default=None, max_length=2048)


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
    userMistake: str = Field(max_length=2000)
    correctAnswer: str = Field(max_length=1000)
    options: list[Annotated[str, Field(max_length=1000)]] = Field(max_length=4)
    tags: list[Annotated[str, Field(max_length=50)]] = Field(max_length=5)
    missingInformation: list[Annotated[str, Field(max_length=300)]] = Field(max_length=8)
    answerSource: AnswerSource
    # Letter the learner chose. Gemini drafts may omit it; the OpenAI output requires it.
    userChoice: UserChoice = ""

    @model_validator(mode="after")
    def clear_missing_answer(self):
        if self.answerSource == "MISSING":
            self.correctAnswer = ""
        return self


class GeminiDraftOutput(DraftCore):
    """Gemini compatibility mode: one free-text explanation."""

    trapTip: str = Field(max_length=4000)


class MistakeDraft(DraftCore):
    """Draft returned to the app. trapTip is plain text for older clients, search and backups."""

    trapTip: str = Field(max_length=4000)
    optionNotes: list[OptionNote] = Field(default_factory=list, max_length=4)
    explanation: Explanation | None = None

    def compose_trap_tip(self) -> None:
        """Write trapTip from the structured sections with fixed labels; Gemini drafts keep their own text."""
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
        self.trapTip = "\n\n".join(sections)


class OpenAIDraftOutput(DraftCore):
    """OpenAI strict structured output: every property is required."""

    userChoice: UserChoice
    optionNotes: list[OptionNote] = Field(max_length=4)
    explanation: Explanation

    def to_draft(self) -> MistakeDraft:
        draft = MistakeDraft(**self.model_dump(), trapTip="")
        draft.compose_trap_tip()
        return draft

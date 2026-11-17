"""Bounded, evidence-linked learning advice for one saved Full Test attempt."""
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AnalyzeAttemptRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    attemptId: str = Field(min_length=1, max_length=200)
    sessionVersion: str = Field(min_length=1, max_length=100)
    noteVersions: dict[str, str] = Field(max_length=300)
    request_id: UUID = Field(strict=False)
    # The learner agreed to send this attempt to the named recipient; any other recipient is refused before quota.
    consent: Literal[True]
    provider: Literal["openai"]


class AnalysisPriority(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    title: str = Field(min_length=5, max_length=120)
    observation: str = Field(min_length=10, max_length=500)
    practice: str = Field(min_length=15, max_length=700)
    part: int | None = Field(ge=1, le=7)
    evidenceIds: list[str] = Field(max_length=5)
    minutes: int = Field(ge=5, le=45)

    @field_validator("title", "observation", "practice")
    @classmethod
    def plain_advice(cls, value: str) -> str:
        # Plain text only; numeric evidence is supplied separately by the server.
        # This is a bounded output check, not a semantic proof of the advice.
        if any(token in value.lower() for token in ("http:", "https:", "www.", "<", ">",
                                                    "đảm bảo tăng", "cam kết tăng", "chắc chắn đạt", "guaranteed score")):
            raise ValueError("Use plain advice without links or score guarantees")
        return value.strip()


class AnalysisAdvice(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    priorities: list[AnalysisPriority] = Field(min_length=1, max_length=3)

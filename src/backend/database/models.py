from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import date, datetime
from uuid import UUID
from pydantic import BaseModel


class CourseConfig(SQLModel, table=True):
    """Tracks UI state for folders on the hard drive"""

    id: Optional[int] = Field(default=None, primary_key=True)
    folder_name: str = Field(unique=True, index=True)  # e.g., "Math101"
    is_active: bool = Field(default=True)


class ResourceMeta(SQLModel, table=True):
    """Caches slow LLM/Whisper tasks so you don't re-run them"""

    id: Optional[UUID] = Field(default=None, primary_key=True)
    relative_path: str = Field(
        unique=True, index=True
    )  # e.g., "CourseA/Lecture1/audio.mp3"
    is_transcribed: bool = Field(default=False)
    transcript_text: Optional[str] = None
    last_processed: Optional[datetime] = None


class AnkiCard(SQLModel, table=True):
    """Your exact model, plus reference to source file"""

    id: Optional[UUID] = Field(default=None, primary_key=True)
    easiness_factor: float = Field(default=2.5)
    repetitions: int = Field(default=0)
    interval: int = Field(default=0)
    quality: int = Field(default=0)
    a_content: str
    b_content: str
    notes: Optional[str] = None
    next_date: date = Field(default_factory=date.today, index=True)
    course: str  # Foreign Key to CourseConfig.folder_name conceptually
    is_question: bool = False
    source_file: Optional[str] = None  # Helpful to know where it came from


class SimpleAnkiCard(BaseModel):
    a_content: str = Field(description="The Content of one site")
    b_content: str = Field(description="The Content of translation/other site")
    notes: Optional[str] = Field(
        None, description="Optional notes and context or examples"
    )
    is_question: bool = False
    course: str

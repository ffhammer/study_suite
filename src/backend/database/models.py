from datetime import date, datetime
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel
from sqlmodel import Column, Field, ForeignKey, Relationship, SQLModel, String


class CourseConfig(SQLModel, table=True):
    """Tracks UI state for folders on the hard drive"""

    folder_name: str = Field(unique=True, index=True, primary_key=True)
    is_active: bool = Field(default=True)


class ResourceMeta(SQLModel, table=True):
    """Caches slow LLM/Whisper tasks so you don't re-run them"""

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    course: str = Field(
        sa_column=Column(
            String,
            ForeignKey(
                "courseconfig.folder_name", onupdate="CASCADE", ondelete="CASCADE"
            ),
            index=True,
        )
    )
    relative_path: str = Field(
        unique=True, index=True
    )  # e.g., "CourseA/Lecture1/audio.mp3"
    is_transcribed: bool = Field(default=False)
    transcript_text: Optional[str] = None

    # pass through types (Only filled in Tree, not Saved)

    last_processed: Optional[datetime] = None
    last_modified_disk: Optional[datetime] = None
    size: Optional[int] = None


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


class TextUpdate(BaseModel):
    content: str


class ChatSession(SQLModel, table=True):
    """Groups messages together. Can optionally be linked to a specific course."""

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    title: str = Field(default="New Chat")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_message: datetime = Field(default_factory=datetime.utcnow)
    course: Optional[str] = Field(default=None, foreign_key="courseconfig.folder_name")

    messages: list["ChatMessage"] = Relationship(
        back_populates="session",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class ChatMessageImage(SQLModel, table=True):
    """Stores raw bytes for pasted images"""

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    message_id: UUID = Field(foreign_key="chatmessage.id", index=True)
    image_data: bytes

    message: "ChatMessage" = Relationship(back_populates="images")


class ChatMessage(SQLModel, table=True):
    """Individual messages in a session."""

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    session_id: UUID = Field(foreign_key="chatsession.id", index=True)

    role: str = Field(description="'user' or 'model'")
    content: str = Field(description="The raw text of the message")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    session: ChatSession = Relationship(back_populates="messages")
    images: list[ChatMessageImage] = Relationship(
        back_populates="message",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )

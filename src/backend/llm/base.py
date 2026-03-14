from abc import ABC, abstractmethod
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from src.backend.database.models import ChatMessage, ChatSession


class SimpleAnkiCard(BaseModel):
    a_content: str = Field(description="Front of the card (Question/Term)")
    b_content: str = Field(description="Back of the card (Answer/Definition)")
    notes: Optional[str] = Field(
        None, description="Optional notes, context, or examples"
    )
    is_question: bool = Field(
        default=False, description="True if 'a' is a question, False if just a term"
    )


class ActionPayload(BaseModel):
    action_type: Literal["None", "NewAnkiCards", "SummaryEdit"] = Field(
        description="The type of action to perform. Pick 'None' if just chatting."
    )
    # Fields for Anki
    new_cards: Optional[List[SimpleAnkiCard]] = Field(
        default=None,
        description="List of cards to create if action_type is NewAnkiCards",
    )
    # Fields for File Editing
    target_file: Optional[str] = Field(
        default=None,
        description="The relative path of the file to edit (e.g., 'Lectures/Intro/summary.md')",
    )
    proposed_markdown: Optional[str] = Field(
        default=None,
        description="The ENTIRE rewritten markdown file. Do not use diffs or placeholders. Provide the full text.",
    )


class LLMResponse(BaseModel):
    display_text: str = Field(description="What the chatbot says to the user in the UI")
    actions: ActionPayload


class ChatResponseMetadata(BaseModel):
    context_file_count: int = Field(
        default=0,
        description="Number of selected context files included in the request.",
    )
    pasted_image_count: int = Field(
        default=0,
        description="Number of pasted images attached to the user message.",
    )


class ChatResponseMessage(BaseModel):
    id: UUID
    role: Literal["user", "model"]
    content: str
    created_at: datetime


class ChatEndpointResponse(BaseModel):
    session_id: UUID
    conversation_id: UUID
    metadata: ChatResponseMetadata
    message: ChatResponseMessage
    actions: ActionPayload


class BaseLearningAgent(ABC):
    """
    Standard interface for all LLM providers.
    No complex agent loops—just classical, predictable LLM calls.
    """

    def __init__(self, system_message: str, model_name: str):
        self.system_message = system_message
        self.model_name = model_name

    def set_model_name(self, model_name: str) -> None:
        self.model_name = model_name

    def set_system_message(self, system_message: str) -> None:
        self.system_message = system_message

    @abstractmethod
    async def get_answer(
        self,
        session: "ChatSession | None",
        new_message: "ChatMessage",
        context_paths: List[Path] = [],
    ) -> LLMResponse | str:
        """
        Takes the selected files and the chat history,
        returns a structured LLMResponse or a string error message.
        """
        pass

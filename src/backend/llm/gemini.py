import os
import mimetypes
from pathlib import Path
from typing import List

# 1. Use the NEW modern GenAI SDK
from google import genai
from google.genai import types

from src.backend.database.models import ChatMessage, ChatSession

from .base import BaseLearningAgent, LLMResponse


class GeminiLearningAgent(BaseLearningAgent):
    def __init__(self, system_message: str, model_name: str):
        super().__init__(system_message=system_message, model_name=model_name)

        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        self.client = genai.Client(api_key=api_key)

    async def get_answer(
        self,
        session: ChatSession | None,
        new_message: ChatMessage,
        context_paths: List[Path] = [],
    ) -> LLMResponse:

        # 3. Build dynamic Part objects for Context (PDFs as inline 64-bit & High-Res Images)
        # We process these directly into SDK Part objects instead of long concatenated strings
        context_parts = []
        for path in context_paths:
            if not path.exists():
                continue

            # Read file as raw bytes. The modern SDK automatically handles base64 encoding
            # under the hood for you when hitting the REST endpoints.
            file_bytes = path.read_bytes()
            mime_type, _ = mimetypes.guess_type(path)

            if not mime_type:
                mime_type = "application/octet-stream"

            if mime_type == "application/pdf":
                # Native PDF Document processing [2]
                context_parts.append(
                    types.Part.from_bytes(data=file_bytes, mime_type="application/pdf")
                )
            elif mime_type.startswith("image/"):
                # High-Resolution Image processing natively.
                # Gemini automatically scales image context up to 3072x3072px preserving detail. [3]
                context_parts.append(
                    types.Part.from_bytes(data=file_bytes, mime_type=mime_type)
                )
            else:
                # Text/Markdown/Code files fall back to raw strings
                text_content = (
                    f"\n--- File: {path.name} ---\n{file_bytes.decode('utf-8')}\n"
                )
                context_parts.append(text_content)

        # 4. Format multi-turn conversation history correctly
        # Instead of using a stateful chat session, passing structured `Content` objects
        # is the most robust way to inject complex files into specific messages.
        history: List[ChatMessage] = []
        if session and session.messages:
            history = sorted(session.messages, key=lambda m: m.created_at)

        # Ensure the just-created message exists in the prompt history.
        if not history or history[-1].id != new_message.id:
            history.append(new_message)

        formatted_contents = []
        for i, msg in enumerate(history):
            role = "user" if msg.role == "user" else "model"
            parts = []

            # Include pasted user images directly with the message.
            if role == "user" and getattr(msg, "images", None):
                for image in msg.images:
                    parts.append(
                        types.Part.from_bytes(
                            data=image.image_data,
                            mime_type="image/png",
                        )
                    )

            # Inject selected context only with the latest user turn.
            if i == len(history) - 1 and role == "user":
                parts.extend(context_parts)

            parts.append(msg.content)
            formatted_contents.append(types.Content(role=role, parts=parts))

        # 5. Define generation config with pure Pydantic Structured Output & System Instructions [1]
        config = types.GenerateContentConfig(
            system_instruction=self.system_message,
            temperature=0.2,
            response_mime_type="application/json",
            media_resolution=types.MediaResolution.MEDIA_RESOLUTION_HIGH,
            response_json_schema=LLMResponse.model_json_schema(),
        )

        # 6. Call the new fully Async client (.aio.models)
        response = await self.client.aio.models.generate_content(
            model=self.model_name, contents=formatted_contents, config=config
        )

        # 7. Parse the strictly formatted JSON back into the Pydantic model
        return LLMResponse.model_validate_json(response.text)

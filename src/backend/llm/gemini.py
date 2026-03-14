import asyncio
import mimetypes
import os
import time
from pathlib import Path
from typing import List

# 1. Use the NEW modern GenAI SDK
from google import genai
from google.genai import types
from loguru import logger

from src.backend.database.models import ChatMessage, ChatSession

from .base import BaseLearningAgent, LLMResponse, SimpleAnkiCard


class GeminiLearningAgent(BaseLearningAgent):
    def __init__(self, system_message: str, model_name: str):
        super().__init__(system_message=system_message, model_name=model_name)

        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError(
                "No API key was provided. Set GEMINI_API_KEY or GOOGLE_API_KEY."
            )
        self.client = genai.Client(api_key=api_key)

    async def get_answer(
        self,
        session: ChatSession | None,
        new_message: ChatMessage,
        context_paths: List[Path] = [],
        existing_cards: List[SimpleAnkiCard] | None = None,
        anki_feedback: str | None = None,
    ) -> LLMResponse | str:
        # 3. Build dynamic Part objects for Context (PDFs as inline 64-bit & High-Res Images)
        # We process these directly into SDK Part objects instead of long concatenated strings
        context_parts = []
        for path in context_paths:
            if not path.exists():
                continue

            mime_type, _ = mimetypes.guess_type(path)
            try:
                file_bytes = path.read_bytes()
            except Exception as e:
                logger.error(f"Error reading context file {path}: {e}")
                continue

            if mime_type == "application/pdf":
                context_parts.append(
                    types.Part.from_bytes(data=file_bytes, mime_type="application/pdf")
                )
            elif mime_type and mime_type.startswith("image/"):
                context_parts.append(
                    types.Part.from_bytes(data=file_bytes, mime_type=mime_type)
                )
            else:
                # Safe decoding for text-based files
                try:
                    text_content = file_bytes.decode("utf-8")
                    context_parts.append(
                        types.Part.from_text(
                            text=f"\n[File: {path.name}]\n{text_content}\n"
                        )
                    )
                except UnicodeDecodeError:
                    # Skip binary files that aren't images/PDFs
                    continue

        # 4. Format multi-turn conversation history correctly
        # Instead of using a stateful chat session, passing structured `Content` objects
        # is the most robust way to inject complex files into specific messages.
        history: List[ChatMessage] = []
        try:
            if session and session.messages:
                history = sorted(session.messages, key=lambda m: m.created_at)
        except Exception as e:
            logger.error(f"Error accessing session messages: {e}")
            # If we hit DetachedInstanceError here, we might want to fail gracefully
            return "Error accessing chat history. Please try again."

        # Ensure the just-created message exists in the prompt history.
        if not history or history[-1].id != new_message.id:
            history.append(new_message)

        formatted_contents = []
        for i, msg in enumerate(history):
            role = "user" if msg.role == "user" else "model"
            parts = []

            # Include pasted user images directly with the message.
            try:
                if role == "user" and getattr(msg, "images", None):
                    for image in msg.images:
                        parts.append(
                            types.Part.from_bytes(
                                data=image.image_data,
                                mime_type="image/png",
                            )
                        )
            except Exception as e:
                logger.warning(f"Error accessing message images: {e}")

            # Inject selected context only with the latest user turn.
            if i == len(history) - 1 and role == "user":
                parts.extend(context_parts)

                if existing_cards:
                    cards_lines = []
                    for idx, card in enumerate(existing_cards, start=1):
                        note = f" | Notes: {card.notes}" if card.notes else ""
                        cards_lines.append(
                            f"{idx}. Front: {card.a_content} | Back: {card.b_content}{note}"
                        )
                    parts.append(
                        types.Part.from_text(
                            text=(
                                "\n[Existing Anki Cards For This Course]\n"
                                "Do not generate duplicate cards of these entries.\n"
                                + "\n".join(cards_lines)
                                + "\n"
                            )
                        )
                    )

                if anki_feedback and anki_feedback.strip():
                    parts.append(
                        types.Part.from_text(
                            text=(
                                "\n[Anki Review Feedback From User]\n"
                                "Use this to improve the next generated cards.\n"
                                f"{anki_feedback.strip()}\n"
                            )
                        )
                    )

            if msg.content:
                parts.append(types.Part.from_text(text=msg.content))

            formatted_contents.append(types.Content(role=role, parts=parts))

        # 5. Define generation config with pure Pydantic Structured Output & System Instructions [1]
        config = types.GenerateContentConfig(
            system_instruction=self.system_message,
            temperature=0.2,
            response_mime_type="application/json",
            media_resolution=types.MediaResolution.MEDIA_RESOLUTION_HIGH,
            response_json_schema=LLMResponse.model_json_schema(),
        )

        try:
            # 6. Call the new fully Async client (.aio.models)
            start = time.time()
            response = await asyncio.wait_for(
                self.client.aio.models.generate_content(
                    model=self.model_name, contents=formatted_contents, config=config
                ),
                timeout=45,
            )

            # 7. Parse the strictly formatted JSON back into the Pydantic model
            if not response.text:
                logger.error("Empty response from Gemini")
                return "The AI returned an empty response. This might be due to safety filters or a temporary issue."
            parsed_response = LLMResponse.model_validate_json(response.text)
            logger.debug(
                f"Gemini Response took {time.time() - start:.1f}s. Awnser is:\n{parsed_response.display_text[:100]}"
            )

            return parsed_response
        except asyncio.TimeoutError:
            logger.error("Gemini API timeout after 45 seconds")
            return "The AI request timed out after 45 seconds. Please try again."
        except Exception as e:
            logger.error(f"Gemini API Error: {e}")
            error_msg = str(e)
            if "429" in error_msg or "quota" in error_msg.lower():
                return "Rate limit exceeded. Please wait a moment before trying again."
            elif "503" in error_msg or "overloaded" in error_msg.lower():
                return "The AI service is currently overloaded. Please try again in a few seconds."
            else:
                return f"An error occurred while communicating with the AI: {error_msg}"

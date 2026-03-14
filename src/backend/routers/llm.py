from datetime import datetime
from pathlib import Path
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import selectinload

from src.backend.config import ApiConfig
from src.backend.database.db import DataBase
from src.backend.database.models import ChatMessage, ChatMessageImage, ChatSession
from src.backend.llm.base import (
    ChatEndpointResponse,
    ChatResponseMessage,
    ChatResponseMetadata,
)

chat_router = APIRouter(prefix="/chat", tags=["chat"])


class ChatSettingsResponse(BaseModel):
    provider: str
    model: str
    system_prompt: str
    supported_models: list[str]


class UpdateChatSettingsRequest(BaseModel):
    provider: str | None = None
    model: str | None = None
    system_prompt: str | None = None


@chat_router.get("/settings", response_model=ChatSettingsResponse)
async def get_chat_settings(request: Request) -> ChatSettingsResponse:
    config: ApiConfig = request.app.state.config
    settings: dict = request.app.state.chat_settings
    return ChatSettingsResponse(
        provider=settings["provider"],
        model=settings["model"],
        system_prompt=settings["system_prompt"],
        supported_models=config.GEMINI_ALLOWED_MODELS,
    )


@chat_router.put("/settings", response_model=ChatSettingsResponse)
async def update_chat_settings(
    payload: UpdateChatSettingsRequest,
    request: Request,
) -> ChatSettingsResponse:
    config: ApiConfig = request.app.state.config
    settings: dict = request.app.state.chat_settings

    if payload.provider is not None:
        provider = payload.provider.strip().lower()
        if provider != "gemini":
            raise HTTPException(
                status_code=400, detail="Only gemini provider is supported"
            )
        settings["provider"] = provider

    if payload.model is not None:
        model = payload.model.strip()
        if not model:
            raise HTTPException(status_code=400, detail="model cannot be empty")
        if model not in config.GEMINI_ALLOWED_MODELS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported model '{model}'.",
            )
        settings["model"] = model

    if payload.system_prompt is not None:
        system_prompt = payload.system_prompt.strip()
        if not system_prompt:
            raise HTTPException(status_code=400, detail="system_prompt cannot be empty")
        settings["system_prompt"] = system_prompt

    agent = request.app.state.agent
    if agent is not None:
        agent.set_model_name(settings["model"])
        agent.set_system_message(settings["system_prompt"])

    return ChatSettingsResponse(
        provider=settings["provider"],
        model=settings["model"],
        system_prompt=settings["system_prompt"],
        supported_models=config.GEMINI_ALLOWED_MODELS,
    )


@chat_router.get("/conversations/")
async def get_conversations(request: Request, course_name: Optional[str] = None):
    db: DataBase = request.app.state.db
    where_clauses = []
    if course_name:
        where_clauses.append(ChatSession.course == course_name)

    sessions = await db.query_table(
        ChatSession,
        where_clauses=where_clauses,
        order_by=[ChatSession.last_message.desc()],
    )
    return sessions


@chat_router.delete("/conversation/{session_id}")
async def delete_conversation(session_id: UUID, request: Request):
    db: DataBase = request.app.state.db
    session = await db.query_table(
        ChatSession, where_clauses=[ChatSession.id == session_id], mode="first"
    )
    if not session:
        raise HTTPException(status_code=404, detail="Conversation not found")

    await db.delete(session)
    return {"message": "Deleted successfully"}


class RenameRequest(BaseModel):
    title: str


@chat_router.put("/conversation/{session_id}")
async def rename_conversation(session_id: UUID, req: RenameRequest, request: Request):
    db: DataBase = request.app.state.db
    session = await db.query_table(
        ChatSession, where_clauses=[ChatSession.id == session_id], mode="first"
    )
    if not session:
        raise HTTPException(status_code=404, detail="Conversation not found")

    session.title = req.title
    await db.save(session)
    return session


@chat_router.delete("/message/{message_id}")
async def delete_message(message_id: UUID, request: Request):
    db: DataBase = request.app.state.db
    message = await db.query_table(
        ChatMessage, where_clauses=[ChatMessage.id == message_id], mode="first"
    )
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    # Delete all messages in the session that came after this one (including it)
    later_messages = await db.query_table(
        ChatMessage,
        where_clauses=[
            ChatMessage.session_id == message.session_id,
            ChatMessage.created_at >= message.created_at,
        ],
    )

    if later_messages:
        await db.delete_all(later_messages)

    # Update last_message on session
    session = await db.query_table(
        ChatSession, where_clauses=[ChatSession.id == message.session_id], mode="first"
    )

    last_msg = await db.query_table(
        ChatMessage,
        where_clauses=[ChatMessage.session_id == message.session_id],
        order_by=[ChatMessage.created_at.desc()],
        mode="first",
    )
    if session:
        session.last_message = last_msg.created_at if last_msg else session.created_at
        await db.save(session)

    return {"message": "Messages deleted from this point forward"}


@chat_router.post("/")
async def get_response(
    request: Request,
    content: str = Form(...),
    conversation_id: Optional[UUID] = Form(None),
    course_name: Optional[str] = Form(None),
    context_files: list[str] = Form([]),
    images: list[UploadFile] = File([]),
) -> ChatEndpointResponse:
    db: DataBase = request.app.state.db
    config: ApiConfig = request.app.state.config

    # Load or create session
    if conversation_id:
        session = await db.query_table(
            ChatSession,
            where_clauses=[ChatSession.id == conversation_id],
            options=[
                selectinload(ChatSession.messages).selectinload(ChatMessage.images)
            ],
            mode="first",
        )
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        if course_name and session.course and course_name != session.course:
            raise HTTPException(
                status_code=400,
                detail="course_name does not match existing conversation",
            )
        session_course = session.course
    else:
        if course_name is None:
            raise HTTPException(status_code=400, detail="course_name is required")

        session = ChatSession(
            course=course_name,
            title=content[:30] + ("..." if len(content) > 30 else ""),
        )
        session = await db.save(session)
        conversation_id = session.id
        session_course = course_name

    # Save the new user message
    user_msg = ChatMessage(session_id=session.id, role="user", content=content)
    user_msg = await db.save(user_msg)

    # Save images if any
    has_images = False
    if images:
        for img in images:
            if img.filename:
                data = await img.read()
                if data:
                    has_images = True
                    img_record = ChatMessageImage(
                        message_id=user_msg.id,
                        image_data=data,
                    )
                    await db.save(img_record)
            await img.close()

    # Reload the user message so newly persisted images are available for the agent.
    user_msg = await db.query_table(
        ChatMessage,
        where_clauses=[ChatMessage.id == user_msg.id],
        options=[selectinload(ChatMessage.images)],
        mode="first",
    )

    if user_msg is None:
        raise HTTPException(status_code=500, detail="Failed to persist user message")

    # Resolve selected context files to absolute paths in the course vault.
    selected_context_files = context_files or []
    context_paths: list[Path] = []
    if session_course:
        context_paths = [
            config.save_join_file_path(session_course, rel_path)
            for rel_path in selected_context_files
        ]

    session.last_message = datetime.utcnow()
    await db.save(session)

    agent = request.app.state.agent
    if agent is None:
        raise HTTPException(
            status_code=503,
            detail="LLM is not configured. Set GEMINI_API_KEY or GOOGLE_API_KEY and restart the backend.",
        )

    # Reload session to ensure it's bound to the current session and has messages loaded
    session = await db.query_table(
        ChatSession,
        where_clauses=[ChatSession.id == session.id],
        options=[selectinload(ChatSession.messages).selectinload(ChatMessage.images)],
        mode="first",
    )

    response = await agent.get_answer(
        session=session,
        new_message=user_msg,
        context_paths=context_paths,
    )

    if isinstance(response, str):
        # We don't save the model response if there was an error message string returned
        raise HTTPException(status_code=500, detail=response)

    model_msg = ChatMessage(
        session_id=session.id,
        role="model",
        content=response.display_text,
    )
    model_msg = await db.save(model_msg)

    session.last_message = datetime.utcnow()
    await db.save(session)

    return ChatEndpointResponse(
        session_id=session.id,
        conversation_id=session.id,
        metadata=ChatResponseMetadata(
            context_file_count=len(selected_context_files),
            pasted_image_count=len(user_msg.images) if has_images else 0,
        ),
        message=ChatResponseMessage(
            id=model_msg.id,
            role=model_msg.role,
            content=model_msg.content,
            created_at=model_msg.created_at,
        ),
        actions=response.actions,
    )

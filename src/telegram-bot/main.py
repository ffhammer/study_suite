from __future__ import annotations

import io
import os
import re
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import httpx
from loguru import logger
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ChatAction
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

CALLBACK_PICK_COURSE = "pick_course"
CALLBACK_PICK_FOLDER = "pick_folder"
CALLBACK_FOLDER_PAGE = "folder_page"
CALLBACK_RUN_TRANSCRIBE = "run_transcribe"
CALLBACK_CHECK_TRANSCRIBE = "check_transcribe"


def bot_instructions_text() -> str:
    return (
        "How to use this bot:\n"
        "1. Send an image/audio/video/document file (not plain text).\n"
        "2. Pick a course.\n"
        "3. Pick destination folder (or course root).\n"
        "4. For media, press 'Transcribe now' if you want.\n\n"
        "Useful commands:\n"
        "- /start\n"
        "- /courses\n"
        "- /whoami"
    )


@dataclass
class PendingUpload:
    file_id: str
    file_name: str
    mime_type: str
    transcribe_candidate: bool


class BackendClient:
    def __init__(self, base_url: str, bot_api_key: str | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.bot_api_key = bot_api_key
        self.client = httpx.AsyncClient(timeout=120.0)

    def _headers(self) -> dict[str, str]:
        headers: dict[str, str] = {}
        if self.bot_api_key:
            headers["X-Bot-Api-Key"] = self.bot_api_key
        return headers

    async def close(self) -> None:
        await self.client.aclose()

    async def get_courses(self) -> list[str]:
        response = await self.client.get(
            f"{self.base_url}/courses/list", headers=self._headers()
        )
        response.raise_for_status()
        data = response.json()
        return [course["folder_name"] for course in data if course.get("folder_name")]

    async def get_folders(self, course_name: str) -> list[str]:
        response = await self.client.get(
            f"{self.base_url}/courses/course/{quote(course_name, safe='')}/tree",
            headers=self._headers(),
        )
        response.raise_for_status()
        data = response.json()
        folders = sorted(
            {
                item["relative_path"].rstrip("/")
                for item in data
                if isinstance(item.get("relative_path"), str)
                and item["relative_path"].endswith("/")
            }
        )
        return folders

    async def get_supported_types(self) -> dict[str, list[str]]:
        response = await self.client.get(
            f"{self.base_url}/info/supported-types", headers=self._headers()
        )
        response.raise_for_status()
        data = response.json()
        return {
            "audio": [value.lower() for value in data.get("audio", [])],
            "video": [value.lower() for value in data.get("video", [])],
            "img": [value.lower() for value in data.get("img", [])],
        }

    async def upload_file(
        self,
        course_name: str,
        file_name: str,
        file_bytes: bytes,
        mime_type: str,
        target_rel_path: str,
    ) -> dict[str, Any]:
        files = {
            "file": (
                file_name,
                io.BytesIO(file_bytes),
                mime_type or "application/octet-stream",
            )
        }
        data = {"target_rel_path": target_rel_path}
        response = await self.client.post(
            f"{self.base_url}/files/upload/{quote(course_name, safe='')}",
            files=files,
            data=data,
            headers=self._headers(),
        )
        response.raise_for_status()
        return response.json()

    async def start_transcription(self, course_name: str, rel_path: str) -> dict[str, Any]:
        response = await self.client.post(
            f"{self.base_url}/files/transcribe/{quote(course_name, safe='')}/{quote(rel_path, safe='/')}",
            headers=self._headers(),
        )
        response.raise_for_status()
        return response.json()

    async def get_transcription_status(
        self, course_name: str, rel_path: str
    ) -> dict[str, Any]:
        response = await self.client.get(
            f"{self.base_url}/files/transcribe/status/{quote(course_name, safe='')}/{quote(rel_path, safe='/')}",
            headers=self._headers(),
        )
        response.raise_for_status()
        return response.json()


def get_backend(context: ContextTypes.DEFAULT_TYPE) -> BackendClient:
    backend = context.application.bot_data.get("backend")
    if not isinstance(backend, BackendClient):
        raise RuntimeError("Backend client not configured")
    return backend


def parse_allowed_chat_ids(raw_value: str | None) -> set[int]:
    if not raw_value:
        return set()
    result: set[int] = set()
    for piece in raw_value.split(","):
        value = piece.strip()
        if not value:
            continue
        try:
            result.add(int(value))
        except ValueError:
            logger.warning("Invalid TELEGRAM_ALLOWED_CHAT_IDS entry ignored: {}", value)
    return result


def parse_allowed_usernames(raw_value: str | None) -> set[str]:
    if not raw_value:
        return set()
    usernames: set[str] = set()
    for piece in raw_value.split(","):
        username = piece.strip().lstrip("@").lower()
        if username:
            usernames.add(username)
    return usernames


def is_allowed_chat(
    context: ContextTypes.DEFAULT_TYPE, chat_id: int, username: str | None
) -> bool:
    allowed_chat_ids = context.application.bot_data.get("allowed_chat_ids", set())
    allowed_usernames = context.application.bot_data.get("allowed_usernames", set())

    chat_ok = (
        not isinstance(allowed_chat_ids, set)
        or not allowed_chat_ids
        or chat_id in allowed_chat_ids
    )

    normalized_username = (username or "").strip().lstrip("@").lower()
    username_ok = (
        not isinstance(allowed_usernames, set)
        or not allowed_usernames
        or normalized_username in allowed_usernames
    )

    # If both filters are configured, both must match.
    if isinstance(allowed_chat_ids, set) and allowed_chat_ids and isinstance(allowed_usernames, set) and allowed_usernames:
        return chat_ok and username_ok

    return chat_ok and username_ok


def safe_file_name(name: str | None, fallback_prefix: str) -> str:
    candidate = (name or "").strip()
    if not candidate:
        candidate = f"{fallback_prefix}_{int(time.time())}"
    candidate = candidate.replace("\\", "_").replace("/", "_")
    candidate = re.sub(r"[^A-Za-z0-9._-]+", "_", candidate)
    return candidate or f"{fallback_prefix}_{int(time.time())}"


def extension_of(name: str) -> str:
    lower = name.lower()
    idx = lower.rfind(".")
    if idx == -1:
        return ""
    return lower[idx:]


def build_folder_keyboard(folders: list[str], page: int, page_size: int = 8) -> InlineKeyboardMarkup:
    start = page * page_size
    end = start + page_size
    page_items = folders[start:end]

    rows: list[list[InlineKeyboardButton]] = [
        [InlineKeyboardButton("Upload to course root", callback_data=f"{CALLBACK_PICK_FOLDER}|root")]
    ]

    for folder in page_items:
        rows.append(
            [
                InlineKeyboardButton(
                    f"/{folder}",
                    callback_data=f"{CALLBACK_PICK_FOLDER}|{folder}",
                )
            ]
        )

    nav_row: list[InlineKeyboardButton] = []
    if page > 0:
        nav_row.append(
            InlineKeyboardButton(
                "Prev",
                callback_data=f"{CALLBACK_FOLDER_PAGE}|{page - 1}",
            )
        )
    if end < len(folders):
        nav_row.append(
            InlineKeyboardButton(
                "Next",
                callback_data=f"{CALLBACK_FOLDER_PAGE}|{page + 1}",
            )
        )
    if nav_row:
        rows.append(nav_row)

    return InlineKeyboardMarkup(rows)


async def start_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_chat is None or update.message is None:
        return
    if not is_allowed_chat(
        context,
        update.effective_chat.id,
        update.effective_user.username if update.effective_user else None,
    ):
        await update.message.reply_text("This chat is not allowed to use this bot.")
        return

    await update.message.reply_text(bot_instructions_text())


async def courses_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_chat is None or update.message is None:
        return
    if not is_allowed_chat(
        context,
        update.effective_chat.id,
        update.effective_user.username if update.effective_user else None,
    ):
        await update.message.reply_text("This chat is not allowed to use this bot.")
        return

    try:
        courses = await get_backend(context).get_courses()
    except Exception as exc:
        logger.exception("Failed to load courses: {}", exc)
        await update.message.reply_text("Could not load courses from backend.")
        return

    if not courses:
        await update.message.reply_text("No courses found in backend.")
        return

    await update.message.reply_text("Available courses:\n- " + "\n- ".join(courses))


async def handle_media(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.message
    chat = update.effective_chat
    if message is None or chat is None:
        return
    if not is_allowed_chat(
        context,
        chat.id,
        update.effective_user.username if update.effective_user else None,
    ):
        await message.reply_text("This chat is not allowed to use this bot.")
        return

    supported = context.application.bot_data.get(
        "supported_types",
        {"audio": [".mp3", ".wav", ".m4a"], "video": [".mp4", ".mkv", ".mov"]},
    )
    audio_exts = set(supported.get("audio", []))
    video_exts = set(supported.get("video", []))
    transcribe_exts = audio_exts | video_exts

    pending: PendingUpload | None = None

    if message.photo:
        photo = message.photo[-1]
        pending = PendingUpload(
            file_id=photo.file_id,
            file_name=safe_file_name(None, "photo") + ".jpg",
            mime_type="image/jpeg",
            transcribe_candidate=False,
        )
    elif message.video:
        video = message.video
        name = safe_file_name(video.file_name, "video")
        if extension_of(name) == "":
            name += ".mp4"
        pending = PendingUpload(
            file_id=video.file_id,
            file_name=name,
            mime_type=video.mime_type or "video/mp4",
            transcribe_candidate=True,
        )
    elif message.audio:
        audio = message.audio
        name = safe_file_name(audio.file_name, "audio")
        if extension_of(name) == "":
            name += ".mp3"
        pending = PendingUpload(
            file_id=audio.file_id,
            file_name=name,
            mime_type=audio.mime_type or "audio/mpeg",
            transcribe_candidate=True,
        )
    elif message.document:
        document = message.document
        name = safe_file_name(document.file_name, "document")
        ext = extension_of(name)
        pending = PendingUpload(
            file_id=document.file_id,
            file_name=name,
            mime_type=document.mime_type or "application/octet-stream",
            transcribe_candidate=ext in transcribe_exts,
        )

    if pending is None:
        return

    context.user_data["pending_upload"] = pending

    try:
        courses = await get_backend(context).get_courses()
    except Exception as exc:
        logger.exception("Failed to load courses for upload: {}", exc)
        await message.reply_text("Failed to load courses. Is backend reachable?")
        return

    if not courses:
        await message.reply_text("No courses available. Create a course first in Study Suite.")
        return

    context.user_data["course_options"] = courses
    keyboard = [
        [
            InlineKeyboardButton(
                course,
                callback_data=f"{CALLBACK_PICK_COURSE}|{idx}",
            )
        ]
        for idx, course in enumerate(courses)
    ]

    await message.reply_text(
        f"Received file: {pending.file_name}\nChoose target course:",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )


async def whoami_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_chat is None or update.message is None:
        return

    user = update.effective_user
    username = user.username if user else None
    user_id = user.id if user else None
    chat_id = update.effective_chat.id

    await update.message.reply_text(
        "Telegram identity info:\n"
        f"- chat_id: {chat_id}\n"
        f"- user_id: {user_id}\n"
        f"- username: @{username if username else 'none'}"
    )


async def unknown_command_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_chat is None or update.message is None:
        return
    if not is_allowed_chat(
        context,
        update.effective_chat.id,
        update.effective_user.username if update.effective_user else None,
    ):
        await update.message.reply_text("This chat is not allowed to use this bot.")
        return

    await update.message.reply_text(
        "Unrecognized command.\n\n" + bot_instructions_text()
    )


async def non_media_text_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_chat is None or update.message is None:
        return
    if not is_allowed_chat(
        context,
        update.effective_chat.id,
        update.effective_user.username if update.effective_user else None,
    ):
        await update.message.reply_text("This chat is not allowed to use this bot.")
        return

    await update.message.reply_text(
        "Please send a file (image/audio/video/document) to upload.\n\n"
        + bot_instructions_text()
    )


async def handle_pick_course(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if query is None or query.message is None:
        return
    await query.answer()

    if update.effective_chat is None or not is_allowed_chat(
        context,
        update.effective_chat.id,
        update.effective_user.username if update.effective_user else None,
    ):
        await query.edit_message_text("This chat is not allowed to use this bot.")
        return

    payload = (query.data or "").split("|", 1)
    if len(payload) != 2:
        await query.edit_message_text("Invalid course selection payload.")
        return

    try:
        index = int(payload[1])
    except ValueError:
        await query.edit_message_text("Invalid course index.")
        return

    courses = context.user_data.get("course_options", [])
    if not isinstance(courses, list) or index < 0 or index >= len(courses):
        await query.edit_message_text("Course selection expired. Send the file again.")
        return

    selected_course = courses[index]
    context.user_data["selected_course"] = selected_course

    try:
        folders = await get_backend(context).get_folders(selected_course)
    except Exception as exc:
        logger.exception("Failed to load folders: {}", exc)
        await query.edit_message_text("Could not load folders for this course.")
        return

    context.user_data["folder_options"] = folders
    context.user_data["folder_page"] = 0

    await query.edit_message_text(
        f"Course: {selected_course}\nChoose destination folder:",
        reply_markup=build_folder_keyboard(folders, page=0),
    )


async def handle_folder_page(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if query is None or query.message is None:
        return
    await query.answer()

    payload = (query.data or "").split("|", 1)
    if len(payload) != 2:
        return

    try:
        page = max(0, int(payload[1]))
    except ValueError:
        return

    folders = context.user_data.get("folder_options", [])
    if not isinstance(folders, list):
        await query.edit_message_text("Folder list expired. Send file again.")
        return

    context.user_data["folder_page"] = page
    await query.edit_message_reply_markup(
        reply_markup=build_folder_keyboard(folders, page=page)
    )


async def handle_pick_folder(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if query is None or query.message is None:
        return
    await query.answer()

    payload = (query.data or "").split("|", 1)
    if len(payload) != 2:
        await query.edit_message_text("Invalid folder selection payload.")
        return

    selected_folder = "" if payload[1] == "root" else payload[1].strip("/")
    pending = context.user_data.get("pending_upload")
    selected_course = context.user_data.get("selected_course")

    if not isinstance(pending, PendingUpload) or not isinstance(selected_course, str):
        await query.edit_message_text("Upload session expired. Send file again.")
        return

    await query.edit_message_text(
        f"Uploading {pending.file_name} to {selected_course}/{selected_folder or '(root)'} ..."
    )

    try:
        await context.bot.send_chat_action(chat_id=query.message.chat_id, action=ChatAction.UPLOAD_DOCUMENT)

        telegram_file = await context.bot.get_file(pending.file_id)
        file_bytes = bytes(await telegram_file.download_as_bytearray())

        target_rel_path = (
            f"{selected_folder}/{pending.file_name}" if selected_folder else pending.file_name
        )

        upload_result = await get_backend(context).upload_file(
            selected_course,
            pending.file_name,
            file_bytes,
            pending.mime_type,
            target_rel_path,
        )
        uploaded_rel_path = str(upload_result.get("filename", target_rel_path))

        context.user_data["last_uploaded"] = {
            "course": selected_course,
            "relative_path": uploaded_rel_path,
            "can_transcribe": pending.transcribe_candidate,
        }

        buttons: list[list[InlineKeyboardButton]] = []
        if pending.transcribe_candidate:
            buttons.append(
                [
                    InlineKeyboardButton(
                        "Transcribe now",
                        callback_data=CALLBACK_RUN_TRANSCRIBE,
                    )
                ]
            )

        await context.bot.send_message(
            chat_id=query.message.chat_id,
            text=(
                "Upload complete.\n"
                f"Course: {selected_course}\n"
                f"Path: {uploaded_rel_path}"
            ),
            reply_markup=InlineKeyboardMarkup(buttons) if buttons else None,
        )
    except Exception as exc:
        logger.exception("Upload flow failed: {}", exc)
        await context.bot.send_message(
            chat_id=query.message.chat_id,
            text="Upload failed. Please try again.",
        )


async def handle_run_transcribe(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if query is None or query.message is None:
        return
    await query.answer()

    session = context.user_data.get("last_uploaded", {})
    course = session.get("course") if isinstance(session, dict) else None
    rel_path = session.get("relative_path") if isinstance(session, dict) else None
    can_transcribe = bool(session.get("can_transcribe")) if isinstance(session, dict) else False

    if not isinstance(course, str) or not isinstance(rel_path, str):
        await query.edit_message_text("No recent upload found. Upload a file first.")
        return

    if not can_transcribe:
        await query.edit_message_text("That file type is not transcribable.")
        return

    try:
        result = await get_backend(context).start_transcription(course, rel_path)
        await query.edit_message_text(
            (
                f"Transcription requested for {rel_path}.\n"
                f"Status: {result.get('message', 'queued')}"
            ),
            reply_markup=InlineKeyboardMarkup(
                [
                    [
                        InlineKeyboardButton(
                            "Check transcription status",
                            callback_data=CALLBACK_CHECK_TRANSCRIBE,
                        )
                    ]
                ]
            ),
        )
    except Exception as exc:
        logger.exception("Failed to trigger transcription: {}", exc)
        await query.edit_message_text("Failed to start transcription.")


async def handle_check_transcribe(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if query is None or query.message is None:
        return
    await query.answer()

    session = context.user_data.get("last_uploaded", {})
    course = session.get("course") if isinstance(session, dict) else None
    rel_path = session.get("relative_path") if isinstance(session, dict) else None

    if not isinstance(course, str) or not isinstance(rel_path, str):
        await query.edit_message_text("No recent upload found. Upload a file first.")
        return

    try:
        status = await get_backend(context).get_transcription_status(course, rel_path)
        state = status.get("status", "unknown")
        progress = status.get("progress")
        total = status.get("total")

        line = f"Status: {state}"
        if isinstance(progress, (int, float)) and isinstance(total, (int, float)) and total > 0:
            line += f" ({progress:.1f}/{total:.1f}s)"

        await query.edit_message_text(
            f"Transcription status for {rel_path}:\n{line}",
            reply_markup=InlineKeyboardMarkup(
                [
                    [
                        InlineKeyboardButton(
                            "Refresh status",
                            callback_data=CALLBACK_CHECK_TRANSCRIBE,
                        )
                    ]
                ]
            ),
        )
    except Exception as exc:
        logger.exception("Failed to load transcription status: {}", exc)
        await query.edit_message_text("Failed to fetch transcription status.")


async def handle_error(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    logger.exception("Telegram bot unhandled error: {}", context.error)


async def app_post_init(app: Application) -> None:
    backend_url = os.environ.get("BACKEND_BASE_URL", "http://backend:8000")
    bot_api_key = os.environ.get("TELEGRAM_BACKEND_API_KEY")
    backend = BackendClient(backend_url, bot_api_key=bot_api_key)
    app.bot_data["backend"] = backend

    allowed = parse_allowed_chat_ids(os.environ.get("TELEGRAM_ALLOWED_CHAT_IDS"))
    app.bot_data["allowed_chat_ids"] = allowed
    allowed_usernames = parse_allowed_usernames(
        os.environ.get("TELEGRAM_ALLOWED_USERNAMES")
    )
    app.bot_data["allowed_usernames"] = allowed_usernames

    try:
        app.bot_data["supported_types"] = await backend.get_supported_types()
    except Exception as exc:
        logger.warning("Could not load supported types from backend: {}", exc)
        app.bot_data["supported_types"] = {
            "audio": [".mp3", ".wav", ".m4a"],
            "video": [".mp4", ".mkv", ".mov"],
            "img": [".png", ".jpg", ".jpeg"],
        }

    logger.info("Telegram bot initialized with backend {}", backend_url)


async def app_post_shutdown(app: Application) -> None:
    backend = app.bot_data.get("backend")
    if isinstance(backend, BackendClient):
        await backend.close()


def main() -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is required")

    log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
    logger.remove()
    logger.add(lambda msg: print(msg, end=""), level=log_level)

    application = (
        Application.builder()
        .token(token)
        .post_init(app_post_init)
        .post_shutdown(app_post_shutdown)
        .build()
    )

    application.add_handler(CommandHandler("start", start_cmd))
    application.add_handler(CommandHandler("courses", courses_cmd))
    application.add_handler(CommandHandler("whoami", whoami_cmd))
    application.add_handler(
        MessageHandler(
            filters.PHOTO | filters.VIDEO | filters.AUDIO | filters.Document.ALL,
            handle_media,
        )
    )
    application.add_handler(MessageHandler(filters.COMMAND, unknown_command_cmd))
    application.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND, non_media_text_cmd)
    )

    application.add_handler(
        CallbackQueryHandler(handle_pick_course, pattern=f"^{CALLBACK_PICK_COURSE}\\|")
    )
    application.add_handler(
        CallbackQueryHandler(handle_folder_page, pattern=f"^{CALLBACK_FOLDER_PAGE}\\|")
    )
    application.add_handler(
        CallbackQueryHandler(handle_pick_folder, pattern=f"^{CALLBACK_PICK_FOLDER}\\|")
    )
    application.add_handler(
        CallbackQueryHandler(handle_run_transcribe, pattern=f"^{CALLBACK_RUN_TRANSCRIBE}$")
    )
    application.add_handler(
        CallbackQueryHandler(handle_check_transcribe, pattern=f"^{CALLBACK_CHECK_TRANSCRIBE}$")
    )

    application.add_error_handler(handle_error)
    logger.info("Starting Telegram bot in long polling mode")
    application.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()

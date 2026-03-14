# Telegram Bot

Long-polling Telegram bot for uploading files from phone to Study Suite backend.

## Features

- Upload from Telegram chat: photo, document, audio, video
- Pick target course via inline keyboard
- Pick target folder (course root or nested folder)
- Trigger transcription after upload for audio/video files
- Check transcription status from Telegram

## Environment variables

- `TELEGRAM_BOT_TOKEN` (required): Telegram Bot token from BotFather
- `BACKEND_BASE_URL` (optional): default `http://backend:8000`
- `TELEGRAM_ALLOWED_CHAT_IDS` (optional): comma-separated chat IDs allowlist
- `TELEGRAM_ALLOWED_USERNAMES` (optional): comma-separated usernames allowlist (with or without `@`)
- `TELEGRAM_BACKEND_API_KEY` (optional): sent as `X-Bot-Api-Key` to backend
- `LOG_LEVEL` (optional): `INFO`, `DEBUG`, etc.

## Run locally

From repo root:

```bash
uv run python src/telegram-bot/main.py
```

## Run with Docker Compose profile

```bash
docker compose --profile telegram up -d telegram-bot
```

This uses a dedicated lightweight bot image from `Dockerfile.telegram`.

## Security notes

- Uses long polling, so no public webhook endpoint is required.
- Keep your backend private on Tailscale/local network.
- Use `TELEGRAM_ALLOWED_CHAT_IDS` and/or `TELEGRAM_ALLOWED_USERNAMES` in production.

## Useful commands

- `/start`: show usage
- `/courses`: list courses from backend
- `/whoami`: show your `chat_id`, `user_id`, and `username` for allowlist setup

Since you are already highly capable with FastAPI, Pydantic, SQL, and LLM Agent design, this plan skips the beginner basics and focuses entirely on **architecture, schema design, API contract formulation, and the Agent loop.**

Here is the comprehensive backend development plan for your Study Suite.

---

### 1. Global Architecture & Project Structure

Since this is a local, single-user app, we will use **SQLite** (fast, zero setup, easy to back up) and treat a local directory (e.g., `./StudyVault`) as the source of truth for your files.

```text
backend/
├── app/
│   ├── main.py                 # FastAPI instance, CORS setup
│   ├── core/
│   │   ├── config.py           # BaseVaultDir path, LLM API keys
│   │   └── database.py         # SQLite engine & session maker
│   ├── models/                 # SQLModels and Pydantic schemas
│   ├── routers/
│   │   ├── anki.py
│   │   ├── courses.py          # Folder scanning, course config
│   │   ├── files.py            # Upload, edit markdown, serve static
│   │   ├── media.py            # Whisper, OCR triggers
│   │   └── chat.py             # Agent interface
│   └── services/
│       ├── file_system.py      # Logic for scanning ./StudyVault
│       ├── sm2.py              # Anki algorithm logic
│       ├── transcriber.py      # Audio -> text logic
│       └── agent.py            # LLM prompt construction & calls
└── StudyVault/                 # THE ACTUAL DATA (Courses/Lectures/...)
```

---

### 2. Database Schema (SQLModel)

We need the database for three things: Anki cards, tracking Course settings (since folders can't store "is_active"), and caching media metadata (transcripts).

```python
# models/db_models.py
from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import date, datetime

class CourseConfig(SQLModel, table=True):
    """Tracks UI state for folders on the hard drive"""
    id: Optional[int] = Field(default=None, primary_key=True)
    folder_name: str = Field(unique=True, index=True) # e.g., "Math101"
    is_active: bool = Field(default=True)

class ResourceMeta(SQLModel, table=True):
    """Caches slow LLM/Whisper tasks so you don't re-run them"""
    id: Optional[int] = Field(default=None, primary_key=True)
    relative_path: str = Field(unique=True, index=True) # e.g., "CourseA/Lecture1/audio.mp3"
    is_transcribed: bool = Field(default=False)
    transcript_text: Optional[str] = None
    last_processed: Optional[datetime] = None

class AnkiCard(SQLModel, table=True):
    """Your exact model, plus reference to source file"""
    id: Optional[int] = Field(default=None, primary_key=True)
    easiness_factor: float = Field(default=2.5)
    repetitions: int = Field(default=0)
    interval: int = Field(default=0)
    quality: int = Field(default=0)
    a_content: str
    b_content: str
    notes: Optional[str] = None
    next_date: date = Field(default_factory=date.today, index=True)
    course: str # Foreign Key to CourseConfig.folder_name conceptually
    is_question: bool = False
    source_file: Optional[str] = None # Helpful to know where it came from
```

---

### 3. API Endpoints Contract

#### A. Course & File System Management (`routers/courses.py` & `files.py`)

The backend must scan the `StudyVault` directory and return a nested tree for the UI to render the left sidebar.

- **`GET /api/courses/tree`**
  - _Action:_ Traverses the `StudyVault` directory. Reads `CourseConfig` from DB.
  - _Returns:_
    ```json
    [
      {
        "name": "CourseA",
        "is_active": true,
        "lectures": [
          {
            "name": "FourierTransform",
            "files": [
              {
                "name": "summary.md",
                "path": "CourseA/FourierTransform/summary.md",
                "type": "markdown"
              },
              {
                "name": "slides.pdf",
                "path": "CourseA/FourierTransform/Files/slides.pdf",
                "type": "pdf"
              }
            ]
          }
        ]
      }
    ]
    ```
- **`POST /api/courses/{course_name}/toggle`**
  - _Action:_ Updates `is_active` in `CourseConfig`.
- **`GET /api/files/content?path={relative_path}`**
  - _Action:_ Returns the raw text of a `.md` file.
- **`PUT /api/files/content?path={relative_path}`**
  - _Action:_ Saves edits (Command+S from the frontend editor) directly to the OS file.
- **`POST /api/files/upload`**
  - _Action:_ Accepts `UploadFile` and a target directory, saves to the OS.
- **`GET /api/static/{file_path:path}`**
  - _Action:_ Uses FastAPI's `FileResponse` to serve PDFs, Images, and MP3s directly to the frontend player/viewer.

#### B. Media Processing (`routers/media.py`)

- **`POST /api/media/transcribe`**
  - _Input:_ `{"file_path": "CourseA/Lecture1/audio.mp3"}`
  - _Action:_ Checks `ResourceMeta`. If not transcribed, runs local Whisper (or API), saves transcript to `ResourceMeta`, returns text.
- **`POST /api/media/ocr`**
  - _Input:_ `{"file_path": "CourseA/Lecture1/slide.png", "prompt": "..."}`
  - _Action:_ Sends image to Gemini/GPT-4o Vision, returns markdown text.

#### C. Anki System (`routers/anki.py`)

- **`GET /api/anki/due`** -> Returns cards where `next_date <= today`.
- **`GET /api/anki/all`** -> Optional filters for `course`.
- **`POST /api/anki`** -> Create manual card.
- **`PUT /api/anki/{id}/review`**
  - _Input:_ `{"quality": 3} # 0-5 scale`
  - _Action:_ Runs SM-2 algorithm updating `easiness_factor`, `interval`, `repetitions`, and `next_date`.
- **`PUT /api/anki/{id}`** -> Edit typo in card.
- **`DELETE /api/anki/{id}`** -> Delete card.

---

### 4. The LLM Agent Architecture (`routers/chat.py` & `services/agent.py`)

This is the hardest and most important part. You will use **Pydantic Structured Outputs** (supported natively by OpenAI, Anthropic, and Gemini).

#### Agent Pydantic Schemas

```python
from pydantic import BaseModel
from typing import List, Optional, Literal

class NewAnkiCard(BaseModel):
    a_side: str
    b_side: str
    is_question: bool
    notes: Optional[str]

class ActionPayload(BaseModel):
    action_type: Literal["None", "NewAnkiCards", "SummaryEdit"]
    # If NewAnkiCards:
    new_cards: Optional[List[NewAnkiCard]] = None
    # If SummaryEdit:
    target_file: Optional[str] = None
    proposed_markdown: Optional[str] = None # Just send the FULL new file back. Much safer than search/replace diffs.

class LLMResponse(BaseModel):
    display_text: str # What the chatbot says to the user
    actions: ActionPayload
```

#### The Chat Endpoint

- **`POST /api/chat`**
  - _Input Payload from Frontend:_
    ```json
    {
      "messages": [
        { "role": "user", "content": "Make Anki cards for the selected PDF" }
      ],
      "context_paths": [
        "CourseA/Fourier/Files/slides.pdf",
        "CourseA/Fourier/summary.md"
      ]
    }
    ```
  - _Backend Logic (The Agent Loop):_
    1.  **Hydrate Context:** Loop through `context_paths`.
        - If `.md`, read file content.
        - If `.mp3`, read `transcript_text` from DB.
        - If `.pdf`, use PyPDF2 / pdfplumber to extract text (or pass directly if using Claude/Gemini native PDF support).
    2.  **Construct System Prompt:**
        ```text
        You are a study assistant.
        USER CONTEXT FILES:
        --- START slides.pdf ---
        {extracted_pdf_text}
        --- END slides.pdf ---
        --- START summary.md ---
        {markdown_text}
        --- END summary.md ---
        ```
    3.  **Call LLM:** Force the response format to `LLMResponse` Pydantic schema.
    4.  **Backend Side-Effects (Optional but recommended):**
        - If `action_type == "NewAnkiCards"`, the backend can automatically save them to the DB right now, and `display_text` says "I created 5 cards."
        - If `action_type == "SummaryEdit"`, the backend _does not_ save. It sends the `proposed_markdown` to the frontend so the Monaco DiffEditor can display it.

---

### 5. Step-by-Step Development Roadmap (Backend Only)

**Phase 1: Foundation (Days 1-2)**

1. Set up FastAPI and the local folder structue (`./StudyVault`).
2. Write `services/file_system.py` to walk the directory and generate the JSON tree.
3. Create the `GET /api/courses/tree` and `GET /api/static/{path}` endpoints.
   _Test: Open browser, hit `/api/courses/tree` and see your local folders as JSON._

**Phase 2: Text & Anki Core (Days 2-3)**

1. Setup SQLModel/SQLite.
2. Build all `/api/anki/*` CRUD routes.
3. Write the SM-2 review logic for `PUT /api/anki/{id}/review`.
4. Create the `GET /api/files/content` and `PUT /api/files/content` to read/write Markdown files.
   _Test: Hit endpoints with Swagger/Postman to create a card, review it, and modify a local .md file._

**Phase 3: Media & Processing (Days 4-5)**

1. Implement `ResourceMeta` in the DB.
2. Build the `/api/media/transcribe` endpoint. Use `whisper` library locally or just wire it to `openai.Audio.transcriptions`.
3. Build the `/api/media/ocr` for images.
   _Test: Upload an MP3, hit the transcribe endpoint, verify it saves to DB and returns text._

**Phase 4: The Agent (Days 5-7)**

1. Write the context-gathering function (given a list of file paths, extract their text into a string).
2. Wire up the LLM SDK (e.g., `client.beta.chat.completions.parse` for OpenAI to force Pydantic output).
3. Build `POST /api/chat`.
   _Test: Send a mock chat request in Swagger with a path to a summary.md. Ask it to generate Anki cards. Verify the JSON response perfectly matches `LLMResponse`._

### Why this design makes your Frontend easy:

Because you are handling **all the complex state** on the backend:

1. The frontend doesn't need to know how to parse PDFs to send to the chatbot. It just sends the `path`, and your backend extracts it.
2. The frontend doesn't need to calculate Anki algorithms. It just sends `{"quality": 4}` and your backend updates the date.
3. The frontend doesn't have to parse weird `<<<< SEARCH ==== REPLACE >>>>` blocks. Your backend instructs the LLM to output the whole new document, so the frontend Monaco Diff Editor just compares `oldFileText` to `payload.proposed_markdown`.

If you build this API layer exactly as outlined, vibecoding the frontend with React/shadcn will be a breeze because the API contracts are incredibly clean and predictable.

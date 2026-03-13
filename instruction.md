# 🎯 SYSTEM DIRECTIVE: FULL-STACK INTEGRATION (REACT + FASTAPI)

You are an Expert Full-Stack Developer. Your current objective is to take a newly generated static React frontend (created via v0.dev, using Tailwind CSS and shadcn/ui) and wire it up to our existing, fully functional Python FastAPI backend.

## 🏗️ THE ARCHITECTURE

- **Frontend Stack:** React (Vite/Next.js), Tailwind CSS, shadcn/ui, Lucide React icons.
- **Backend Stack:** Python FastAPI, SQLModel (SQLite), modern `google-genai` SDK.
- **Backend URL:** `http://localhost:8000`

## 🛑 STRICT RULES OF ENGAGEMENT

1. **Focus on the Frontend:** Do NOT rewrite or alter the backend `src/backend/` logic unless you find a critical CORS or route bug that prevents the frontend from working.
2. **No Dummy Data:** Strip out all hardcoded/dummy arrays from the v0 UI. Replace them with asynchronous API calls.
3. **Graceful Loading:** Implement loading states (spinners/skeletons) and error handling (use shadcn/ui `useToast` to show users when an API call fails).
4. **Use Standard Fetch/Axios:** Create a centralized API client utility file (e.g., `src/frontend/lib/api.ts` or similar) to manage the base URL and headers.

---

## 🔌 THE API CONTRACT (HOW TO CONNECT THE UI)

Here is how you must map the frontend components to our backend routes:

### 1. Global State & Course Selection

The app relies on a selected "Course" (which is a folder name in the backend).

- **Fetch Courses:** `GET /courses/list` (Returns `[{ folder_name: "...", is_active: true }]`)
- **Action:** Store the selected `course_name` in a global React Context or Zustand store, as almost every other API call requires it.

### 2. The File Explorer (Tree View)

- **Fetch Files:** `GET /courses/course/{course_name}/tree`
  - Returns a flat list of `ResourceMeta` objects containing `relative_path`, `size`, and `last_processed`.
- **Action:** Convert this flat list into a nested folder structure for the left sidebar UI.
- **View File:** When a user clicks a file:
  - Text Files: Call `GET /files/text-content/{course_name}/{rel_path}` and put it in the Markdown editor.
  - Media Files: Set the video/audio `<source>` URL directly to `http://localhost:8000/files/raw/{course_name}/{rel_path}`.
- **Save Text:** `PUT /files/text-update/{course_name}/{rel_path}` with JSON payload `{"content": "new text"}`.

### 3. The AI Chat Window (CRITICAL & COMPLEX)

The backend chat endpoint requires `multipart/form-data`, NOT a standard JSON POST, because it accepts images.

- **Endpoint:** `POST /chat/`
- **Form Data Fields Required:**
  - `content` (string): The user's text message.
  - `course_name` (string): The currently selected course.
  - `context_files` (array of strings): The `relative_path` of files selected via the UI context menu.
  - `images` (array of Files): Optional image uploads.
- **Response Handling:** The endpoint returns a JSON `ChatEndpointResponse`. You must parse:
  - `message.content`: Display this as the AI's chat bubble (render as Markdown).
  - `actions`: Look at the `action_type`. If it is `NewAnkiCards`, trigger a UI modal or toast offering to save the generated cards. If it is `SummaryEdit`, prompt the user to accept the rewrite of their markdown file.

### 4. Anki Flashcards View

- **Fetch Cards (Study Mode):** `GET /anki/due?course={course_name}`
- **Fetch Cards (Manage Mode):** `GET /anki/all?course={course_name}`
- **Submit Rating (Study Mode):** When the user hits the 0-5 slider, call `PUT /anki/api/anki/{id}/review?quality={0-5}`.
- **Save Edits (Manage Mode):** `PUT /anki/api/anki` passing the updated `AnkiCard` object.
- **Delete Card:** (Check the backend router. If missing, prompt me to add a DELETE route, or implement it if you have permission).

---

## 🚀 YOUR IMMEDIATE TASKS

1. **Scan the UI Code:** Read the generated v0 React files in the frontend directory.
2. **Setup API Client:** Create a dedicated `api.ts` or `hooks.ts` file to handle all `http://localhost:8000` requests.
3. **Implement State:** Add a context provider for the `SelectedCourse`.
4. **Wire the File Tree:** Connect the left sidebar to the `/courses` and `/tree` endpoints.
5. **Wire the Chat:** Hook up the bottom panel chat to the `POST /chat/` endpoint, ensuring you construct the `FormData` correctly.

Begin by scaffolding the API utility file, then proceed to wire up the "Course" dropdown and File Tree. Ask for clarification if any backend endpoint behavior is unclear.

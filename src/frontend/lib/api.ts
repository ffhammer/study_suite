const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export interface CourseConfig {
  folder_name: string;
  is_active: boolean;
}

export interface ResourceMeta {
  id?: string;
  course: string;
  relative_path: string;
  is_transcribed?: boolean;
  transcript_text?: string | null;
  last_processed?: string | null;
  size?: number | null;
}

export interface ChatActionPayload {
  action_type: "None" | "NewAnkiCards" | "SummaryEdit";
  new_cards?: Array<{
    a_content: string;
    b_content: string;
    notes?: string | null;
    is_question: boolean;
  }> | null;
  target_file?: string | null;
  proposed_markdown?: string | null;
}

export interface ChatEndpointResponse {
  session_id: string;
  conversation_id: string;
  metadata: {
    context_file_count: number;
    pasted_image_count: number;
  };
  message: {
    id: string;
    role: "user" | "model";
    content: string;
    created_at: string;
  };
  actions: ChatActionPayload;
}

export interface AnkiCard {
  id: string;
  easiness_factor: number;
  repetitions: number;
  interval: number;
  quality: number;
  a_content: string;
  b_content: string;
  notes?: string | null;
  next_date: string;
  course: string;
  is_question: boolean;
  source_file?: string | null;
}

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export const api = {
  baseUrl: API_BASE_URL,

  listCourses() {
    return fetchJSON<CourseConfig[]>("/courses/list");
  },

  getCourseTree(courseName: string) {
    return fetchJSON<ResourceMeta[]>(`/courses/course/${encodeURIComponent(courseName)}/tree`);
  },

  getTextContent(courseName: string, relativePath: string) {
    return fetchJSON<{ content: string }>(
      `/files/text-content/${encodeURIComponent(courseName)}/${encodeURI(relativePath)}`
    );
  },

  updateTextContent(courseName: string, relativePath: string, content: string) {
    return fetchJSON<{ status: string; last_modified: string }>(
      `/files/text-update/${encodeURIComponent(courseName)}/${encodeURI(relativePath)}`,
      {
        method: "PUT",
        body: JSON.stringify({ content }),
      }
    );
  },

  getRawFileUrl(courseName: string, relativePath: string) {
    return `${API_BASE_URL}/files/raw/${encodeURIComponent(courseName)}/${encodeURI(relativePath)}`;
  },

  async sendChatMessage(input: {
    content: string;
    courseName: string;
    contextFiles: string[];
    images?: File[];
    conversationId?: string;
  }) {
    const formData = new FormData();
    formData.append("content", input.content);
    formData.append("course_name", input.courseName);

    if (input.conversationId) {
      formData.append("conversation_id", input.conversationId);
    }

    for (const relPath of input.contextFiles) {
      formData.append("context_files", relPath);
    }

    for (const image of input.images || []) {
      formData.append("images", image);
    }

    const response = await fetch(`${API_BASE_URL}/chat/`, {
      method: "POST",
      body: formData,
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Request failed with status ${response.status}`);
    }

    return (await response.json()) as ChatEndpointResponse;
  },

  getDueCards(courseName: string) {
    return fetchJSON<AnkiCard[]>(`/anki/due?course=${encodeURIComponent(courseName)}`);
  },

  getAllCards(courseName: string) {
    return fetchJSON<AnkiCard[]>(`/anki/all?course=${encodeURIComponent(courseName)}`);
  },

  reviewCard(cardId: string, quality: number) {
    return fetchJSON<void>(
      `/anki/api/anki/${encodeURIComponent(cardId)}/review?quality=${encodeURIComponent(String(quality))}`,
      { method: "PUT" }
    );
  },

  updateCard(card: AnkiCard) {
    return fetchJSON<void>("/anki/api/anki", {
      method: "PUT",
      body: JSON.stringify(card),
    });
  },

  deleteCard(cardId: string) {
    return fetchJSON<{ status: string }>(`/anki/api/anki/${encodeURIComponent(cardId)}`, {
      method: "DELETE",
    });
  },
};

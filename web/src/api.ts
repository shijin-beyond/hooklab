export interface EventSummary {
  id: string;
  createdAt: string;
  contentType: string;
  sizeBytes: number;
  headers: Record<string, string>;
}

export interface EventDetail extends EventSummary {
  payload: string;
}

export interface Attempt {
  id: string;
  seq: number;
  status: "sending" | "delivered" | "failed" | "interrupted";
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  httpStatus: number | null;
  responsePreview: string | null;
  error: string | null;
}

export interface Run {
  id: string;
  createdAt: string;
  eventId: string;
  targetUrl: string;
  deliveries: number;
  intervalMs: number;
  timeoutMs: number;
  status: "pending" | "running" | "completed" | "interrupted" | "failed";
  startedAt: string | null;
  finishedAt: string | null;
  attempts?: Attempt[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : `request failed: ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

export const api = {
  createEvent: (input: {
    payload: string;
    contentType?: string;
    headers?: Record<string, string> | undefined;
  }) => request<{ id: string }>("/api/events", { method: "POST", body: JSON.stringify(input) }),
  listEvents: () => request<EventSummary[]>("/api/events"),
  getEvent: (id: string) => request<EventDetail>(`/api/events/${id}`),
  createRun: (input: {
    eventId: string;
    targetUrl: string;
    deliveries: number;
    intervalMs: number;
    timeoutMs: number;
  }) => request<{ id: string }>("/api/runs", { method: "POST", body: JSON.stringify(input) }),
  listRuns: () => request<Run[]>("/api/runs"),
  getRun: (id: string) => request<Run>(`/api/runs/${id}`),
};

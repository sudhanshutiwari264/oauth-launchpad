import type { AppSummary, GenerateEvent, OAuthGuide } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function parseErrorDetail(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body.detail ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function listApps(query?: string): Promise<AppSummary[]> {
  const url = new URL(`${API_URL}/api/apps`);
  if (query) url.searchParams.set("q", query);

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new ApiError(response.status, await parseErrorDetail(response));
  return response.json();
}

export async function getGuide(id: string): Promise<OAuthGuide> {
  const response = await fetch(`${API_URL}/api/guides/${id}`, { cache: "no-store" });
  if (!response.ok) throw new ApiError(response.status, await parseErrorDetail(response));
  return response.json();
}

export async function updateStepCompletion(
  guideId: string,
  stepId: string,
  completed: boolean
): Promise<OAuthGuide> {
  const response = await fetch(`${API_URL}/api/guides/${guideId}/steps/${stepId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed }),
  });
  if (!response.ok) throw new ApiError(response.status, await parseErrorDetail(response));
  return response.json();
}

// Re-runs research against a guide's existing canonical domain and
// overwrites it in place (used by the "Re-check sources" action).
export async function recheckGuide(guideId: string): Promise<OAuthGuide> {
  const response = await fetch(`${API_URL}/api/guides/${guideId}/recheck`, { method: "POST" });
  if (!response.ok) throw new ApiError(response.status, await parseErrorDetail(response));
  return response.json();
}

// Reads the newline-delimited JSON progress stream from POST /api/guides/generate.
// Each complete line is one GenerateEvent; onEvent is called as they arrive so
// the UI can show real research progress instead of a fake loading animation.
export async function generateGuide(
  appNameOrWebsite: string,
  onEvent: (event: GenerateEvent) => void,
  options?: { intendedUse?: string; signal?: AbortSignal }
): Promise<void> {
  const response = await fetch(`${API_URL}/api/guides/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_name_or_website: appNameOrWebsite,
      intended_use: options?.intendedUse || null,
    }),
    signal: options?.signal,
  });

  if (!response.ok || !response.body) {
    throw new ApiError(response.status, await parseErrorDetail(response));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // keep the last, possibly-incomplete line

    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line));
    }
  }

  if (buffer.trim()) onEvent(JSON.parse(buffer));
}

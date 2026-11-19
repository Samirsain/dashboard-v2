const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";
const TOKEN_STORAGE_KEY = "tm_auth_token";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token: string): void {
  getCache.clear();
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearToken(): void {
  getCache.clear();
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

/**
 * Short-lived GET cache. The nav, the page and its modals all ask for /lists
 * and /users, and hopping between pages re-asks for data fetched seconds ago;
 * each of those was a full round trip to a server that can be slow to answer.
 * Identical GETs in flight share one request, and a response is reused for a
 * few seconds. TTL stays under the fastest poller (forms, 20s) so polling
 * still sees fresh data, and any write clears the lot, so a change you just
 * made is never hidden behind a stale read.
 */
const GET_TTL_MS = 15_000;
const getCache = new Map<string, { at: number; promise: Promise<unknown> }>();

function cachedGet<T>(path: string): Promise<T> {
  const hit = getCache.get(path);
  let promise = hit && Date.now() - hit.at < GET_TTL_MS ? (hit.promise as Promise<T>) : undefined;
  if (!promise) {
    const fresh = request<T>(path, { method: "GET" });
    getCache.set(path, { at: Date.now(), promise: fresh });
    // A failure must not be served from cache to the next caller.
    fresh.catch(() => {
      if (getCache.get(path)?.promise === fresh) getCache.delete(path);
    });
    promise = fresh;
  }
  // Every caller gets its own copy, so one page sorting or editing what it
  // got back can't change what another page reads.
  return promise.then((data) => (data == null ? data : structuredClone(data)));
}

async function write<T>(path: string, method: string, body?: unknown): Promise<T> {
  getCache.clear();
  try {
    return await request<T>(path, { method, body });
  } finally {
    // Again after: a GET that started mid-write may have cached the old data.
    getCache.clear();
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {}
): Promise<T> {
  const { method = "GET", body, auth = true } = options;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const message = json?.error?.message ?? `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, json?.error?.code);
  }

  return (json?.data ?? json) as T;
}

export const api = {
  get: <T>(path: string) => cachedGet<T>(path),
  post: <T>(path: string, body?: unknown) => write<T>(path, "POST", body),
  patch: <T>(path: string, body?: unknown) => write<T>(path, "PATCH", body),
  delete: <T>(path: string) => write<T>(path, "DELETE"),
  /** Login/register don't send an existing token — nothing to attach yet. */
  public: {
    post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body, auth: false }),
  },
};

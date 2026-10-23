// HTTP client for the Vangy Wine API. VITE_API_URL points at the Railway server in production;
// in development requests go to /api and Vite proxies them to localhost:4000.
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '') + '/api';
const TOKEN_KEY = 'vangy-token';

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

export const token = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string | null) => { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ } },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(method: string, path: string, body?: unknown, asBlob = false): Promise<T> {
  const headers: Record<string, string> = {};
  const t = token.get();
  if (t) headers.Authorization = `Bearer ${t}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your internet connection and try again.');
  }
  if (res.status === 401 && path !== '/auth/login') onUnauthorized();
  const isJson = res.headers.get('content-type')?.includes('application/json');
  if (!res.ok) {
    const err = isJson ? await res.json().catch(() => null) : null;
    throw new ApiError(res.status, err?.error ?? `Request failed (${res.status}).`);
  }
  if (res.status === 204) return undefined as T;
  const data = asBlob ? await res.blob() : isJson ? await res.json() : await res.blob();
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
  blob: (path: string) => request<Blob>('GET', path, undefined, true),
};

// A fresh key per form submission stops a double-tap from saving the same sale or payment twice.
export const newIdemKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

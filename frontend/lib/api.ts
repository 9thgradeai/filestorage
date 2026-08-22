// Same-origin by default (Next rewrites proxy /api → backend). Override for
// direct cross-origin access if the app is not served behind the Next proxy.
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export interface ApiError extends Error {
  status?: number;
  data?: any;
}

export function buildUrl(path: string): string {
  return path.startsWith('http') ? path : `${API_URL}${path}`;
}

// The CSRF token is a non-HttpOnly cookie set by the backend at login/register.
// Every mutating cookie-authenticated request must echo it back as a header.
function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function setJsonContentType(headers: Headers, body: unknown) {
  if (body instanceof FormData) return;
  if (body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
}

async function parseResponse<T>(res: Response): Promise<T> {
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data: any = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const err: ApiError = new Error(
      (data && (data.message || data.error)) || `Request failed with status ${res.status}`
    );
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

let refreshPromise: Promise<boolean> | null = null;

// Rotates the refresh token (server sets fresh cookies). Shared so concurrent
// 401s only trigger a single refresh round-trip.
async function tryRefreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(buildUrl('/api/auth/refresh'), {
      method: 'POST',
      credentials: 'include',
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function request<T = any>(
  path: string,
  options: RequestInit = {},
  _retried = false
): Promise<T> {
  const headers = new Headers(options.headers);
  setJsonContentType(headers, options.body);

  const method = (options.method || 'GET').toUpperCase();
  // Only cookie-authenticated mutations require the CSRF header.
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const csrf = getCsrfToken();
    if (csrf) headers.set('X-CSRF-Token', csrf);
  }

  const res = await fetch(buildUrl(path), { ...options, headers, credentials: 'include' });

  if (res.status === 401 && !_retried) {
    const refreshed = await tryRefreshSession();
    if (refreshed) return request<T>(path, options, true);
  }

  return parseResponse<T>(res);
}

// Downloads file bytes with the cookie session (auto-refresh on expiry).
export async function downloadFile(path: string): Promise<{ blob: Blob; filename: string }> {
  let res = await fetch(buildUrl(path), { credentials: 'include' });

  if (res.status === 401) {
    const refreshed = await tryRefreshSession();
    if (refreshed) res = await fetch(buildUrl(path), { credentials: 'include' });
  }

  if (!res.ok) throw new Error('Download failed');

  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] || 'download';
  return { blob, filename };
}

export const api = {
  get: <T = any>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T = any>(path: string, body?: any) =>
    request<T>(path, {
      method: 'POST',
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    }),
  put: <T = any>(path: string, body?: any) =>
    request<T>(path, { method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T = any>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export { API_URL };
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** URL assoluto sullo stesso origin (proxy Vite in sviluppo): il cookie di sessione viaggia da solo. */
export const apiUrl = (path: string) => new URL(path, window.location.origin).toString();

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(apiUrl(path), {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? 'Il server non risponde. Riprova tra poco.');
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function apiFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers)
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  return fetch(input, {
    ...init,
    headers,
    credentials: 'include'
  })
}

export async function apiJson<T>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(input, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message =
      typeof data === 'object' && data && 'error' in data && typeof data.error === 'string'
        ? data.error
        : `Request failed (${res.status})`
    throw new ApiError(message, res.status)
  }
  return data as T
}

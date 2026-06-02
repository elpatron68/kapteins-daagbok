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
  init: RequestInit = {},
  timeoutMs = 15000
): Promise<Response> {
  const headers = new Headers(init.headers)
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  if (init.signal) {
    if (init.signal.aborted) {
      controller.abort()
    } else {
      init.signal.addEventListener('abort', () => controller.abort())
    }
  }

  try {
    return await fetch(input, {
      ...init,
      headers,
      credentials: 'include',
      signal: controller.signal
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function apiJson<T>(
  input: string,
  init: RequestInit = {},
  timeoutMs = 15000
): Promise<T> {
  const res = await apiFetch(input, init, timeoutMs)
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

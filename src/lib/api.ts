// Browser-side helpers for the PIN-protected API routes. If the session has
// expired the server answers 401, and we send the device back to the PIN screen.

export class ApiError extends Error {}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    window.location.href = '/login'
    throw new ApiError('Not signed in')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(body.error || 'Request failed')
  return body as T
}

export async function apiGet<T>(path: string): Promise<T> {
  return handle<T>(await fetch(path, { cache: 'no-store' }))
}

export async function apiSend<T>(
  path: string,
  method: 'POST' | 'DELETE',
  body: unknown
): Promise<T> {
  return handle<T>(
    await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

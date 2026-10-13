// Signed PIN session cookie. Works in middleware (Edge) and route handlers
// (Node) via Web Crypto.
//
// Cookie value: "<expiresAtMs>.<hex HMAC-SHA256>". The HMAC key combines the
// server-only Supabase service key with APP_PIN, so the cookie can't be forged
// from the browser, and changing the PIN signs everyone out.

export const SESSION_COOKIE = 'nsfc-auth'
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12 // 12 hours

function signingSecret(): string | null {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const pin = process.env.APP_PIN
  if (!serviceKey || !pin) return null
  return `${serviceKey}:${pin}`
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function createSessionValue(): Promise<string | null> {
  const secret = signingSecret()
  if (!secret) return null
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000
  return `${expiresAt}.${await hmacHex(secret, `session:${expiresAt}`)}`
}

export async function isValidSession(value: string | undefined): Promise<boolean> {
  const secret = signingSecret()
  if (!secret || !value) return false
  const [expiresAtRaw, sig] = value.split('.')
  const expiresAt = Number(expiresAtRaw)
  if (!sig || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return false
  return safeEqual(sig, await hmacHex(secret, `session:${expiresAt}`))
}

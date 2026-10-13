import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionValue,
  safeEqual,
} from '@/lib/session'

// Wrong-PIN limit: 10 failures per IP per 15 minutes. In-memory, so it's per
// server instance — enough to stop casual guessing, not a determined attacker.
const MAX_FAILURES = 10
const WINDOW_MS = 15 * 60 * 1000
const failures = new Map<string, { count: number; resetAt: number }>()

function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

export async function POST(request: Request) {
  const ip = clientIp(request)
  const now = Date.now()
  const record = failures.get(ip)
  if (record && record.resetAt > now && record.count >= MAX_FAILURES) {
    return NextResponse.json(
      { success: false, error: 'Too many attempts. Try again in a few minutes.' },
      { status: 429 }
    )
  }

  const { pin } = await request.json()
  const correctPin = process.env.APP_PIN

  if (!correctPin) {
    return NextResponse.json({ success: false, error: 'Check-in is not configured' }, { status: 500 })
  }

  if (typeof pin === 'string' && safeEqual(pin, correctPin)) {
    const value = await createSessionValue()
    if (!value) {
      return NextResponse.json({ success: false, error: 'Check-in is not configured' }, { status: 500 })
    }
    const cookieStore = await cookies()
    cookieStore.set(SESSION_COOKIE, value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: '/',
    })
    failures.delete(ip)
    return NextResponse.json({ success: true })
  }

  const current = record && record.resetAt > now ? record : { count: 0, resetAt: now + WINDOW_MS }
  failures.set(ip, { count: current.count + 1, resetAt: current.resetAt })
  return NextResponse.json({ success: false, error: 'Invalid PIN' }, { status: 401 })
}

export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
  return NextResponse.json({ success: true })
}

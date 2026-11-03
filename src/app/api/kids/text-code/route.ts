import { NextRequest, NextResponse } from 'next/server'
import { UUID } from '@/lib/kids-server'
import { normalizeCode } from '@/lib/kids'

const DEFAULT_CRM_BASE_URL = 'https://app.newsongtn.cc'

/**
 * POST /api/kids/text-code { eventId, guardianId, code } → { sent, reason? }
 * Asks the CRM to text the parent their pickup code. The kiosk has no Twilio
 * credentials; the CRM checks text consent and sends. Uses the same shared
 * secret as the membership sync (MEMBERSHIP_SYNC_SECRET, CRM_BASE_URL).
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const eventId = typeof body.eventId === 'string' && UUID.test(body.eventId) ? body.eventId : null
  const guardianId = typeof body.guardianId === 'string' && UUID.test(body.guardianId) ? body.guardianId : null
  const code = typeof body.code === 'string' ? normalizeCode(body.code) : ''
  if (!eventId || !guardianId || code.length !== 4) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const secret = process.env.MEMBERSHIP_SYNC_SECRET
  if (!secret) return NextResponse.json({ sent: false, reason: 'Texting is not set up' })
  const base = (process.env.CRM_BASE_URL || DEFAULT_CRM_BASE_URL).replace(/\/+$/, '')

  try {
    const res = await fetch(`${base}/api/kids/text-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ eventId, guardianId, code }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    const result = (await res.json().catch(() => ({}))) as { sent?: boolean; reason?: string }
    if (!res.ok) console.error(`[kids/text-code] CRM answered ${res.status}`)
    return NextResponse.json({ sent: result.sent === true, reason: result.reason })
  } catch (err) {
    console.error('[kids/text-code] request failed:', err)
    return NextResponse.json({ sent: false, reason: 'Could not reach the office system' })
  }
}

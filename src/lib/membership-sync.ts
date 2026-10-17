// Server-only. After the kiosk writes to `attendance`, ask the CRM to re-run
// its membership engine for the people involved (0 events = new contact,
// 1–2 = visitor, 3+ = attendee). The kiosk inserts attendance rows directly,
// so without this call a regular who only ever checks in here stays a
// "visitor" forever. The CRM skips anyone with status_locked = true (the
// Visitor A–F headcount slots) and writes its usual "Auto-status:" audit row.
//
// Needs MEMBERSHIP_SYNC_SECRET (same value as the CRM project) and optionally
// CRM_BASE_URL. Failures are logged and never affect the check-in itself.

import { after } from 'next/server'

const DEFAULT_CRM_BASE_URL = 'https://app.newsongtn.cc'
const TIMEOUT_MS = 10_000

type SyncResult = {
  personId: string
  outcome: 'updated' | 'unchanged' | 'locked' | 'not_found' | 'error'
  from?: string
  to?: string
}

export async function syncMembershipStatus(personIds: string[]): Promise<void> {
  const ids = Array.from(new Set(personIds.filter(Boolean)))
  if (ids.length === 0) return

  const secret = process.env.MEMBERSHIP_SYNC_SECRET
  if (!secret) {
    console.warn(
      `[membership-sync] MEMBERSHIP_SYNC_SECRET is not set; ${ids.length} person(s) will keep their current status`
    )
    return
  }
  const base = (process.env.CRM_BASE_URL || DEFAULT_CRM_BASE_URL).replace(/\/+$/, '')

  try {
    const res = await fetch(`${base}/api/membership/recalculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ personIds: ids, source: 'kiosk' }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      console.error(`[membership-sync] CRM answered ${res.status} for ${ids.length} person(s)`)
      return
    }
    const { results } = (await res.json()) as { results?: SyncResult[] }
    for (const r of results ?? []) {
      if (r.outcome === 'updated') {
        console.log(`[membership-sync] ${r.personId}: ${r.from} → ${r.to}`)
      } else if (r.outcome === 'error' || r.outcome === 'not_found') {
        console.error(`[membership-sync] ${r.personId}: ${r.outcome}`)
      }
    }
  } catch (err) {
    console.error('[membership-sync] request failed:', err)
  }
}

/**
 * Run the sync once the response has been sent, so the greeter never waits on
 * the CRM and a CRM outage cannot fail a check-in. Call from a route handler.
 */
export function scheduleMembershipSync(personIds: string[]): void {
  after(() => syncMembershipStatus(personIds))
}

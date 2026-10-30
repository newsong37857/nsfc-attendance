// Who to look out for at a service: first-timers and people coming back after
// time away. Same rules as the CRM's Sunday live mode
// (nsfc-crm/src/lib/live-checkins.ts), so the volunteer's phone and the
// dashboard always agree:
//   first  — their first visit (or, without one, when they were added) is the event's date
//   back   — they missed the last 3 recorded services of this kind in a row and
//            weren't at anything else in that stretch; `weeks` since their last visit
// Server-only.

import type { SupabaseClient } from '@supabase/supabase-js'

export type WelcomeNote = { kind: 'first' } | { kind: 'back'; weeks: number }

/** Missing this many recorded services in a row counts as time away (the CRM's AWAY_AFTER). */
const AWAY_AFTER = 3
const LOOKBACK_DAYS = 730
const PAGE = 1000

function daysBefore(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

function churchDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

/** Notes for the given people checked in to an event; people with nothing to say are left out. */
export async function welcomeNotes(
  supabase: SupabaseClient,
  eventId: string,
  personIds: string[]
): Promise<Record<string, WelcomeNote>> {
  const notes: Record<string, WelcomeNote> = {}
  if (personIds.length === 0) return notes

  const [{ data: event }, { data: people }] = await Promise.all([
    supabase.from('events').select('event_date, event_type').eq('id', eventId).maybeSingle(),
    supabase.from('people').select('id, first_visit_date, created_at').in('id', personIds),
  ])
  if (!event) return notes

  const regulars: string[] = []
  for (const p of people ?? []) {
    const firstVisit = p.first_visit_date ?? (p.created_at ? churchDate(p.created_at) : null)
    if (firstVisit === event.event_date) notes[p.id] = { kind: 'first' }
    else regulars.push(p.id)
  }
  if (regulars.length === 0 || !event.event_type) return notes

  const { data: services } = await supabase
    .from('events')
    .select('event_date, attendance(count)')
    .eq('event_type', event.event_type)
    .lt('event_date', event.event_date)
    .gte('event_date', daysBefore(event.event_date, LOOKBACK_DAYS))
    .order('event_date', { ascending: false })
  const recorded = (services ?? [])
    .filter((e) => ((e.attendance as unknown as { count: number }[])?.[0]?.count ?? 0) > 0)
    .map((e) => e.event_date as string)
  if (recorded.length < AWAY_AFTER) return notes

  // Anyone at anything since the AWAY_AFTER-th most recent service isn't away.
  const windowStart = recorded[AWAY_AFTER - 1]
  const { data: recent } = await supabase
    .from('attendance')
    .select('person_id, events!inner(event_date)')
    .in('person_id', regulars)
    .gte('events.event_date', windowStart)
    .lt('events.event_date', event.event_date)
  const seen = new Set((recent ?? []).map((r) => r.person_id as string))
  const candidates = regulars.filter((id) => !seen.has(id))
  if (candidates.length === 0) return notes

  const lastVisit = new Map<string, string>()
  for (let from = 0; ; from += PAGE) {
    const { data: earlier } = await supabase
      .from('attendance')
      .select('person_id, events!inner(event_date)')
      .in('person_id', candidates)
      .lt('events.event_date', windowStart)
      .gte('events.event_date', daysBefore(event.event_date, LOOKBACK_DAYS))
      .order('id')
      .range(from, from + PAGE - 1)
    for (const row of earlier ?? []) {
      const date = (row.events as unknown as { event_date: string }).event_date
      if (date > (lastVisit.get(row.person_id) ?? '')) lastVisit.set(row.person_id, date)
    }
    if (!earlier || earlier.length < PAGE) break
  }

  const day = new Date(`${event.event_date}T12:00:00Z`).getTime()
  for (const id of candidates) {
    // No visit on record in the lookback means we can't say how long it's been.
    const last = lastVisit.get(id)
    if (!last) continue
    const weeks = Math.round((day - new Date(`${last}T12:00:00Z`).getTime()) / (7 * 24 * 60 * 60 * 1000))
    notes[id] = { kind: 'back', weeks }
  }
  return notes
}

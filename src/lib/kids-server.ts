// Server-only kids check-in helpers for the /api/kids routes. Children are
// people rows with a kids_children record; a kids check-in writes a
// kids_checkins row (with the family's pickup code) and an attendance row, so
// it counts for the CRM's membership engine like any other check-in.
//
// Children's details never leave these routes except to the room screen, and
// only for children checked in today. Pickup codes are never sent back by a
// search, only once to the parent who just checked in.

import type { SupabaseClient } from '@supabase/supabase-js'
import { churchToday } from '@/lib/supabase-admin'
import { scheduleMembershipSync } from '@/lib/membership-sync'
import { generatePickupCode, roomForChild, type KidsRoom } from '@/lib/kids'

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Unpredictable, unlike Math.random: the code is what releases a child. */
function secureRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32
}

export function clean(value: unknown, max = 200): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim().slice(0, max)
  return v || null
}

/** Audit row for a kiosk write. Never include allergy or care-note text. */
export async function audit(
  supabase: SupabaseClient,
  entry: {
    action: 'INSERT' | 'UPDATE' | 'DELETE'
    table_name: string
    record_id?: string | null
    description: string
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    user_id: null,
    user_email: 'kiosk',
    action: entry.action,
    table_name: entry.table_name,
    record_id: entry.record_id ?? null,
    description: entry.description,
    metadata: { source: 'kids-kiosk', ...(entry.metadata ?? {}) },
  })
  if (error) console.error('[kids] audit write failed:', error.message)
}

export async function loadRooms(supabase: SupabaseClient): Promise<KidsRoom[]> {
  const { data } = await supabase.from('kids_rooms').select('*').order('sort_order')
  return (data ?? []) as KidsRoom[]
}

/** True when the event is today's — kids are only ever checked in to today. */
export async function isTodaysEvent(supabase: SupabaseClient, eventId: string): Promise<boolean> {
  if (!UUID.test(eventId)) return false
  const { data } = await supabase.from('events').select('event_date').eq('id', eventId).maybeSingle()
  return data?.event_date === churchToday()
}

export interface CheckedInChild {
  id: string
  first_name: string
  room: string | null
}

export type CheckInResult =
  | { ok: true; code: string; children: CheckedInChild[]; alreadyIn: string[]; canText: boolean }
  | { ok: false; status: number; error: string }

/**
 * Check a guardian's children in to today's event under one new pickup code.
 * Children already checked in to this event are skipped (and named in
 * alreadyIn); they keep the code they were given then.
 */
export async function checkInChildren(
  supabase: SupabaseClient,
  input: { eventId: string; guardianId: string; childIds: string[]; alsoGuardian: boolean }
): Promise<CheckInResult> {
  const { eventId, guardianId } = input
  const childIds = Array.from(new Set(input.childIds)).filter((id) => UUID.test(id))
  if (!UUID.test(guardianId) || childIds.length === 0) {
    return { ok: false, status: 400, error: 'Choose at least one child' }
  }
  if (!(await isTodaysEvent(supabase, eventId))) {
    return { ok: false, status: 400, error: "Kids can only be checked in to today's service" }
  }

  // Only this guardian's own children.
  const { data: links } = await supabase
    .from('kids_guardians')
    .select('child_id')
    .eq('guardian_id', guardianId)
    .in('child_id', childIds)
  const allowed = new Set((links ?? []).map((l) => l.child_id as string))
  if (allowed.size !== childIds.length) {
    return { ok: false, status: 403, error: 'Those children are not linked to this parent' }
  }

  const today = churchToday()
  const [rooms, { data: kids }, { data: existing }, { data: guardian }] = await Promise.all([
    loadRooms(supabase),
    supabase
      .from('kids_children')
      .select('person_id, room_id, people!kids_children_person_id_fkey(first_name, last_name, date_of_birth)')
      .in('person_id', childIds),
    supabase.from('kids_checkins').select('child_id, pickup_code, checked_out_at').eq('event_id', eventId),
    supabase.from('people').select('first_name, last_name, phone, sms_opt_in').eq('id', guardianId).single(),
  ])

  const already = new Set((existing ?? []).map((c) => c.child_id as string))
  const taken = new Set(
    (existing ?? []).filter((c) => !c.checked_out_at).map((c) => c.pickup_code as string)
  )
  type Kid = {
    person_id: string
    room_id: string | null
    people: { first_name: string; last_name: string; date_of_birth: string | null } | null
  }
  const toCheckIn = ((kids ?? []) as unknown as Kid[]).filter((k) => k.people && !already.has(k.person_id))
  const alreadyIn = ((kids ?? []) as unknown as Kid[])
    .filter((k) => k.people && already.has(k.person_id))
    .map((k) => k.people!.first_name)
  if (toCheckIn.length === 0) {
    return { ok: false, status: 409, error: 'Already checked in today' }
  }

  const code = generatePickupCode(taken, secureRandom)
  const rows = toCheckIn.map((k) => ({
    event_id: eventId,
    child_id: k.person_id,
    room_id: roomForChild(rooms, { room_id: k.room_id, date_of_birth: k.people!.date_of_birth }, today)?.id ?? null,
    guardian_id: guardianId,
    pickup_code: code,
  }))
  const { error } = await supabase.from('kids_checkins').insert(rows)
  if (error) {
    console.error('[kids] check-in insert failed:', error.message)
    return { ok: false, status: 500, error: "Couldn't check in. Please try again." }
  }

  const attendees = [...rows.map((r) => r.child_id), ...(input.alsoGuardian ? [guardianId] : [])]
  const { error: attendError } = await supabase
    .from('attendance')
    .upsert(
      attendees.map((person_id) => ({ event_id: eventId, person_id })),
      { onConflict: 'event_id,person_id', ignoreDuplicates: true }
    )
  if (attendError) console.error('[kids] attendance upsert failed:', attendError.message)
  scheduleMembershipSync(attendees)

  const roomName = new Map(rooms.map((r) => [r.id, r.name]))
  const children = toCheckIn.map((k, i) => ({
    id: k.person_id,
    first_name: k.people!.first_name,
    room: rows[i].room_id ? roomName.get(rows[i].room_id!) ?? null : null,
  }))
  const guardianName = guardian ? `${guardian.first_name} ${guardian.last_name}` : 'a parent'
  await audit(supabase, {
    action: 'INSERT',
    table_name: 'kids_checkins',
    record_id: eventId,
    description: `Kids check-in: ${children.map((c) => c.first_name).join(', ')} checked in by ${guardianName}`,
    metadata: { event_id: eventId, guardian_id: guardianId, child_ids: rows.map((r) => r.child_id) },
  })

  return {
    ok: true,
    code,
    children,
    alreadyIn,
    canText: !!guardian?.phone && guardian.sms_opt_in === true,
  }
}

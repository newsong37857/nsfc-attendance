import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, churchToday } from '@/lib/supabase-admin'
import { UUID, isTodaysEvent, loadRooms } from '@/lib/kids-server'
import { formatAge, roomForChild } from '@/lib/kids'

export interface FamilyChild {
  id: string
  first_name: string
  last_name: string
  age: string | null
  room: string | null
  hasAllergy: boolean
  /** Already checked in to this event. The code is never sent back. */
  checkedIn: boolean
}

export interface Family {
  guardian: { id: string; first_name: string; last_name: string; canText: boolean }
  children: FamilyChild[]
}

type Guardian = { id: string; first_name: string; last_name: string; phone: string | null; sms_opt_in: boolean }

/**
 * GET /api/kids/families?last4=0198&eventId=…   → families of guardians whose phone ends 0198
 * GET /api/kids/families?q=price&eventId=…       → families matching a parent's or child's name
 * One family per guardian, with only what the parent screen shows: names,
 * ages, room, whether there's an allergy (not what it is), and whether each
 * child is already checked in.
 */
export async function GET(req: NextRequest) {
  const supabase = getAdminClient()
  const params = req.nextUrl.searchParams
  const last4 = (params.get('last4') ?? '').replace(/\D/g, '')
  const q = (params.get('q') ?? '').replace(/[%_,.()*\\]/g, ' ').trim()
  const eventId = params.get('eventId') ?? ''

  let guardianIds: string[] = []
  if (last4.length === 4) {
    const { data } = await supabase
      .from('people')
      .select('id, phone')
      .is('deleted_at', null)
      // Digits in order with anything between, then an exact check below:
      // phones are stored as typed ("(423) 555-0198", "423.555.0198").
      .like('phone', `%${last4.split('').join('%')}%`)
    guardianIds = (data ?? [])
      .filter((p) => (p.phone as string).replace(/\D/g, '').endsWith(last4))
      .map((p) => p.id as string)
  } else if (q.length >= 2) {
    const parts = q.split(/\s+/)
    const nameFilter =
      parts.length >= 2
        ? `and(first_name.ilike.${parts[0]}%,last_name.ilike.${parts.slice(1).join(' ')}%)`
        : `first_name.ilike.${q}%,last_name.ilike.${q}%`
    const { data } = await supabase.from('people').select('id').is('deleted_at', null).or(nameFilter).limit(40)
    const ids = (data ?? []).map((p) => p.id as string)
    if (ids.length > 0) {
      // A match may be the parent or the child; either way, find the guardians.
      const { data: links } = await supabase
        .from('kids_guardians')
        .select('guardian_id, child_id')
        .or(`guardian_id.in.(${ids.join(',')}),child_id.in.(${ids.join(',')})`)
      guardianIds = (links ?? []).map((l) => l.guardian_id as string)
    }
  } else {
    return NextResponse.json({ families: [] })
  }

  guardianIds = Array.from(new Set(guardianIds))
  if (guardianIds.length === 0) return NextResponse.json({ families: [] })

  const { data: links } = await supabase
    .from('kids_guardians')
    .select('guardian_id, child_id')
    .in('guardian_id', guardianIds)
  const childIds = Array.from(new Set((links ?? []).map((l) => l.child_id as string)))
  if (childIds.length === 0) return NextResponse.json({ families: [] })

  const today = churchToday()
  const [rooms, { data: guardians }, { data: kids }, checkedInRes] = await Promise.all([
    loadRooms(supabase),
    supabase
      .from('people')
      .select('id, first_name, last_name, phone, sms_opt_in')
      .in('id', guardianIds)
      .is('deleted_at', null),
    supabase
      .from('kids_children')
      .select('person_id, room_id, allergies, people!kids_children_person_id_fkey(first_name, last_name, date_of_birth, deleted_at)')
      .in('person_id', childIds),
    UUID.test(eventId) && (await isTodaysEvent(supabase, eventId))
      ? supabase.from('kids_checkins').select('child_id').eq('event_id', eventId).in('child_id', childIds)
      : Promise.resolve({ data: [] as { child_id: string }[] }),
  ])
  const checkedIn = new Set((checkedInRes.data ?? []).map((c) => c.child_id as string))

  type Kid = {
    person_id: string
    room_id: string | null
    allergies: string | null
    people: { first_name: string; last_name: string; date_of_birth: string | null; deleted_at: string | null } | null
  }
  const kidById = new Map(
    ((kids ?? []) as unknown as Kid[]).filter((k) => k.people && !k.people.deleted_at).map((k) => [k.person_id, k])
  )

  const families: Family[] = ((guardians ?? []) as Guardian[])
    .map((g) => ({
      guardian: { id: g.id, first_name: g.first_name, last_name: g.last_name, canText: !!g.phone && g.sms_opt_in },
      children: (links ?? [])
        .filter((l) => l.guardian_id === g.id)
        .map((l) => kidById.get(l.child_id as string))
        .filter((k): k is Kid => !!k)
        .map((k) => ({
          id: k.person_id,
          first_name: k.people!.first_name,
          last_name: k.people!.last_name,
          age: formatAge(k.people!.date_of_birth, today),
          room: roomForChild(rooms, { room_id: k.room_id, date_of_birth: k.people!.date_of_birth }, today)?.name ?? null,
          hasAllergy: !!k.allergies,
          checkedIn: checkedIn.has(k.person_id),
        }))
        .sort((a, b) => a.first_name.localeCompare(b.first_name)),
    }))
    .filter((f) => f.children.length > 0)
    .sort((a, b) => a.guardian.last_name.localeCompare(b.guardian.last_name))
    .slice(0, 8)

  return NextResponse.json({ families })
}

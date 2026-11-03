import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, churchToday } from '@/lib/supabase-admin'
import { UUID, isTodaysEvent, loadRooms } from '@/lib/kids-server'
import { KIDS_PHOTO_BUCKET, formatAge } from '@/lib/kids'

/** Long enough for a service; the screen refreshes well before it runs out. */
const PHOTO_URL_SECONDS = 60 * 60

export interface RoomChild {
  checkinId: string
  childId: string
  first_name: string
  last_name: string
  age: string | null
  photoUrl: string | null
  allergies: string | null
  careNotes: string | null
  checkedInAt: string
  checkedOutAt: string | null
  method: string | null
  guardians: { name: string; phone: string | null }[]
  pickups: { name: string; relationship: string | null }[]
}

/**
 * GET /api/kids/room                      → { rooms } for the room picker
 * GET /api/kids/room?eventId=…&roomId=…   → { children } checked in to that room today
 * The only place a child's allergies, care notes and photo leave the server,
 * and only for children checked in to today's event. Pickup codes are not
 * included: the volunteer types the code the parent shows.
 */
export async function GET(req: NextRequest) {
  const supabase = getAdminClient()
  const eventId = req.nextUrl.searchParams.get('eventId') ?? ''
  const roomId = req.nextUrl.searchParams.get('roomId') ?? ''

  if (!eventId) {
    const rooms = (await loadRooms(supabase)).filter((r) => r.active)
    return NextResponse.json({ rooms: rooms.map((r) => ({ id: r.id, name: r.name })) })
  }
  if (!UUID.test(roomId) || !(await isTodaysEvent(supabase, eventId))) {
    return NextResponse.json({ error: "Pick a room for today's service" }, { status: 400 })
  }

  const { data: checkins, error } = await supabase
    .from('kids_checkins')
    .select('id, child_id, checked_in_at, checked_out_at, checked_out_method')
    .eq('event_id', eventId)
    .eq('room_id', roomId)
    .order('checked_in_at')
  if (error) return NextResponse.json({ error: 'Could not load the room' }, { status: 500 })
  const childIds = (checkins ?? []).map((c) => c.child_id as string)
  if (childIds.length === 0) return NextResponse.json({ children: [] })

  const [{ data: kids }, { data: links }, { data: pickups }] = await Promise.all([
    supabase
      .from('kids_children')
      .select('person_id, allergies, care_notes, photo_path, people!kids_children_person_id_fkey(first_name, last_name, date_of_birth)')
      .in('person_id', childIds),
    supabase
      .from('kids_guardians')
      .select('child_id, people!kids_guardians_guardian_id_fkey(first_name, last_name, phone)')
      .in('child_id', childIds),
    supabase.from('kids_pickups').select('child_id, name, relationship').in('child_id', childIds),
  ])

  type Kid = {
    person_id: string
    allergies: string | null
    care_notes: string | null
    photo_path: string | null
    people: { first_name: string; last_name: string; date_of_birth: string | null } | null
  }
  type Link = { child_id: string; people: { first_name: string; last_name: string; phone: string | null } | null }
  const kidList = (kids ?? []) as unknown as Kid[]
  const paths = kidList.map((k) => k.photo_path).filter((p): p is string => !!p)
  const signed = paths.length
    ? (await supabase.storage.from(KIDS_PHOTO_BUCKET).createSignedUrls(paths, PHOTO_URL_SECONDS)).data ?? []
    : []
  const urlByPath = new Map(signed.filter((s) => s.path && s.signedUrl).map((s) => [s.path as string, s.signedUrl]))
  const kidById = new Map(kidList.map((k) => [k.person_id, k]))
  const today = churchToday()

  const children: RoomChild[] = (checkins ?? [])
    .map((c) => {
      const k = kidById.get(c.child_id as string)
      if (!k?.people) return null
      return {
        checkinId: c.id as string,
        childId: k.person_id,
        first_name: k.people.first_name,
        last_name: k.people.last_name,
        age: formatAge(k.people.date_of_birth, today),
        photoUrl: k.photo_path ? urlByPath.get(k.photo_path) ?? null : null,
        allergies: k.allergies,
        careNotes: k.care_notes,
        checkedInAt: c.checked_in_at as string,
        checkedOutAt: (c.checked_out_at as string | null) ?? null,
        method: (c.checked_out_method as string | null) ?? null,
        guardians: ((links ?? []) as unknown as Link[])
          .filter((l) => l.child_id === k.person_id && l.people)
          .map((l) => ({ name: `${l.people!.first_name} ${l.people!.last_name}`, phone: l.people!.phone })),
        pickups: (pickups ?? [])
          .filter((p) => p.child_id === k.person_id)
          .map((p) => ({ name: p.name as string, relationship: (p.relationship as string | null) ?? null })),
      }
    })
    .filter((c): c is RoomChild => c !== null)

  return NextResponse.json({ children })
}

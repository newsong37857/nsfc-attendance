import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'

const UUID = /^[0-9a-f-]{36}$/i

async function readIds(req: NextRequest): Promise<{ eventId: string; personId: string } | null> {
  try {
    const { eventId, personId } = await req.json()
    if (typeof eventId !== 'string' || typeof personId !== 'string') return null
    if (!UUID.test(eventId) || !UUID.test(personId)) return null
    return { eventId, personId }
  } catch {
    return null
  }
}

/** GET /api/attendance?eventId=… → { personIds } already checked in */
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('eventId') ?? ''
  if (!UUID.test(eventId)) return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })

  const { data, error } = await getAdminClient()
    .from('attendance')
    .select('person_id')
    .eq('event_id', eventId)
  if (error) return NextResponse.json({ error: 'Could not load attendance' }, { status: 500 })
  return NextResponse.json({ personIds: (data ?? []).map((a) => a.person_id) })
}

/** POST /api/attendance { eventId, personId } → check in (idempotent) */
export async function POST(req: NextRequest) {
  const ids = await readIds(req)
  if (!ids) return NextResponse.json({ error: 'Missing eventId or personId' }, { status: 400 })

  const { data, error } = await getAdminClient()
    .from('attendance')
    .upsert(
      { event_id: ids.eventId, person_id: ids.personId },
      { onConflict: 'event_id,person_id', ignoreDuplicates: true }
    )
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not check in' }, { status: 500 })
  // No row back means they were already checked in.
  return NextResponse.json({ success: true, alreadyCheckedIn: data === null })
}

/** DELETE /api/attendance { eventId, personId } → undo a check-in */
export async function DELETE(req: NextRequest) {
  const ids = await readIds(req)
  if (!ids) return NextResponse.json({ error: 'Missing eventId or personId' }, { status: 400 })

  const { data, error } = await getAdminClient()
    .from('attendance')
    .delete()
    .eq('event_id', ids.eventId)
    .eq('person_id', ids.personId)
    .select('id')
  if (error || !data?.length) {
    return NextResponse.json({ error: 'Could not undo check-in' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

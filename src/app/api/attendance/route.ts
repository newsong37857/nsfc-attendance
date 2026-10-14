import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getContactPrompt } from '@/lib/contact-prompt'

const UUID = /^[0-9a-f-]{36}$/i

async function readIds(
  req: NextRequest
): Promise<{ eventId: string; personId: string; self: boolean } | null> {
  try {
    const { eventId, personId, self } = await req.json()
    if (typeof eventId !== 'string' || typeof personId !== 'string') return null
    if (!UUID.test(eventId) || !UUID.test(personId)) return null
    return { eventId, personId, self: self === true }
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

/**
 * POST /api/attendance { eventId, personId, self? } → check in (idempotent).
 * Self check-ins also get back a contactPrompt when we're missing their phone,
 * email or text consent.
 */
export async function POST(req: NextRequest) {
  const ids = await readIds(req)
  if (!ids) return NextResponse.json({ error: 'Missing eventId or personId' }, { status: 400 })

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('attendance')
    .upsert(
      { event_id: ids.eventId, person_id: ids.personId },
      { onConflict: 'event_id,person_id', ignoreDuplicates: true }
    )
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not check in' }, { status: 500 })
  // No row back means they were already checked in.
  const contactPrompt = ids.self ? await getContactPrompt(supabase, ids.personId) : null
  return NextResponse.json({ success: true, alreadyCheckedIn: data === null, contactPrompt })
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

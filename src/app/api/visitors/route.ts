import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'

const UUID = /^[0-9a-f-]{36}$/i

function clean(value: unknown, max = 200): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim().slice(0, max)
  return v || null
}

/**
 * POST /api/visitors
 * { first_name, last_name, phone?, email?, visitor_type, referral_source?, eventId? }
 * Adds the visitor to the directory and, if eventId is given, checks them in.
 * Returns { person } with only the fields the check-in screen shows.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const firstName = clean(body.first_name, 100)
  const lastName = clean(body.last_name, 100)
  if (!firstName || !lastName) {
    return NextResponse.json({ error: 'First and last name are required' }, { status: 400 })
  }

  const visitorType = clean(body.visitor_type, 50) ?? 'first_time'
  const referral = clean(body.referral_source)
  const notes = [
    visitorType !== 'first_time' ? `Type: ${visitorType}` : 'First time visitor',
    referral ? `Referred by: ${referral}` : '',
  ]
    .filter(Boolean)
    .join('. ')

  const supabase = getAdminClient()
  const { data: person, error } = await supabase
    .from('people')
    .insert({
      first_name: firstName,
      last_name: lastName,
      phone: clean(body.phone, 40),
      email: clean(body.email, 200),
      membership_status: 'visitor',
      notes: notes || null,
    })
    .select('id, first_name, last_name, membership_status')
    .single()

  if (error || !person) {
    return NextResponse.json({ error: 'Could not add visitor' }, { status: 500 })
  }

  let checkedIn = false
  const eventId = typeof body.eventId === 'string' && UUID.test(body.eventId) ? body.eventId : null
  if (eventId) {
    const { error: attendError } = await supabase
      .from('attendance')
      .upsert(
        { event_id: eventId, person_id: person.id },
        { onConflict: 'event_id,person_id', ignoreDuplicates: true }
      )
    checkedIn = !attendError
  }

  return NextResponse.json({ person, checkedIn })
}

import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { audit, checkInChildren, clean, isTodaysEvent } from '@/lib/kids-server'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_CHILDREN = 6

/**
 * POST /api/kids/family — a family new to kids check-in, entered by the parent.
 * {
 *   eventId,
 *   guardian: { first_name, last_name, phone, sms_consent? },
 *   children: [{ first_name, last_name?, date_of_birth?, allergies?, care_notes? }]
 * }
 * Reuses the parent's People record when their phone and name already match
 * one; otherwise adds them as a kiosk visitor. Adds the children, a household,
 * the guardian links, then checks everyone in.
 * → same as POST /api/kids/checkin, plus guardianId
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const supabase = getAdminClient()
  const eventId = typeof body.eventId === 'string' ? body.eventId : ''
  if (!(await isTodaysEvent(supabase, eventId))) {
    return NextResponse.json({ error: "Kids can only be checked in to today's service" }, { status: 400 })
  }

  const g = (body.guardian ?? {}) as Record<string, unknown>
  const firstName = clean(g.first_name, 100)
  const lastName = clean(g.last_name, 100)
  const phone = clean(g.phone, 40)
  const phoneDigits = (phone ?? '').replace(/\D/g, '')
  if (!firstName || !lastName) {
    return NextResponse.json({ error: 'Enter your first and last name' }, { status: 400 })
  }
  if (phoneDigits.length < 10) {
    return NextResponse.json({ error: 'Enter your phone number so we can reach you during the service' }, { status: 400 })
  }

  const rawChildren = Array.isArray(body.children) ? body.children.slice(0, MAX_CHILDREN) : []
  const children = rawChildren
    .map((c) => c as Record<string, unknown>)
    .map((c) => ({
      first_name: clean(c.first_name, 100),
      last_name: clean(c.last_name, 100) ?? lastName,
      date_of_birth: typeof c.date_of_birth === 'string' && DATE.test(c.date_of_birth) ? c.date_of_birth : null,
      allergies: clean(c.allergies, 1000),
      care_notes: clean(c.care_notes, 2000),
    }))
    .filter((c): c is typeof c & { first_name: string } => !!c.first_name)
  if (children.length === 0) {
    return NextResponse.json({ error: 'Add at least one child' }, { status: 400 })
  }

  // Same parent already on file? Match phone digits and first name.
  const { data: candidates } = await supabase
    .from('people')
    .select('id, first_name, last_name, phone')
    .is('deleted_at', null)
    .ilike('first_name', firstName)
    .not('phone', 'is', null)
  const existing = (candidates ?? []).find(
    (p) => (p.phone as string).replace(/\D/g, '').slice(-10) === phoneDigits.slice(-10)
  )

  let guardianId: string
  if (existing) {
    guardianId = existing.id as string
  } else {
    const smsConsent = g.sms_consent === true
    const { data: created, error } = await supabase
      .from('people')
      .insert({
        first_name: firstName,
        last_name: lastName,
        phone,
        membership_status: 'visitor',
        visitor_source: 'kiosk',
        notes: 'Added at the kids check-in kiosk',
        ...(smsConsent
          ? { sms_opt_in: true, sms_opt_in_at: new Date().toISOString(), sms_opt_in_source: 'check_in' }
          : {}),
      })
      .select('id')
      .single()
    if (error || !created) {
      console.error('[kids] could not add guardian:', error?.message)
      return NextResponse.json({ error: "Couldn't save your details. Please ask a volunteer." }, { status: 500 })
    }
    guardianId = created.id as string
  }

  // Household: the parent's own, or a new one named for the family.
  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('person_id', guardianId)
    .limit(1)
    .maybeSingle()
  let householdId = (membership?.household_id as string | undefined) ?? null
  if (!householdId) {
    const { data: household } = await supabase
      .from('households')
      .insert({ name: `${lastName} Family` })
      .select('id')
      .single()
    householdId = (household?.id as string | undefined) ?? null
    if (householdId) {
      await supabase.from('household_members').insert({ household_id: householdId, person_id: guardianId, role: 'head' })
    }
  }

  const childIds: string[] = []
  for (const c of children) {
    const { data: person, error } = await supabase
      .from('people')
      .insert({
        first_name: c.first_name,
        last_name: c.last_name,
        date_of_birth: c.date_of_birth,
        membership_status: 'new_contact',
        visitor_source: 'kiosk',
      })
      .select('id')
      .single()
    if (error || !person) {
      console.error('[kids] could not add child:', error?.message)
      return NextResponse.json({ error: "Couldn't save your children. Please ask a volunteer." }, { status: 500 })
    }
    const id = person.id as string
    childIds.push(id)
    await supabase
      .from('kids_children')
      .insert({ person_id: id, allergies: c.allergies, care_notes: c.care_notes })
    await supabase.from('kids_guardians').insert({ child_id: id, guardian_id: guardianId, relationship: 'Parent' })
    if (householdId) {
      await supabase.from('household_members').insert({ household_id: householdId, person_id: id, role: 'child' })
    }
  }

  await audit(supabase, {
    action: 'INSERT',
    table_name: 'kids_children',
    record_id: guardianId,
    description: `Kids kiosk: ${firstName} ${lastName} added ${children.map((c) => c.first_name).join(', ')}${existing ? '' : ' (new family)'}`,
    metadata: { guardian_id: guardianId, child_ids: childIds, guardian_reused: !!existing },
  })

  const result = await checkInChildren(supabase, { eventId, guardianId, childIds, alsoGuardian: true })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  const { code, children: checkedIn, alreadyIn, canText } = result
  return NextResponse.json({ guardianId, code, children: checkedIn, alreadyIn, canText })
}

import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { digits, sendSmsConfirmation } from '@/lib/contact-prompt'

const UUID = /^[0-9a-f-]{36}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * POST /api/contact
 * { personId, phone?, email?, smsConsent?, emailConsent?, dismissed? }
 * Answer to the after-check-in prompt. Only fills blanks — never replaces a
 * phone or email already on file — and records consent for the number/address
 * that ends up on the record.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const personId = typeof body.personId === 'string' && UUID.test(body.personId) ? body.personId : null
  if (!personId) return NextResponse.json({ error: 'Missing personId' }, { status: 400 })

  const supabase = getAdminClient()
  const now = new Date().toISOString()

  if (body.dismissed === true) {
    await supabase.from('people').update({ contact_prompted_at: now }).eq('id', personId)
    return NextResponse.json({ success: true })
  }

  const phone = typeof body.phone === 'string' && body.phone.trim() ? digits(body.phone) : null
  if (phone !== null && phone.length !== 10) {
    return NextResponse.json({ error: 'Please enter a 10-digit phone number' }, { status: 400 })
  }
  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim().toLowerCase() : null
  if (email !== null && (!EMAIL.test(email) || email.length > 254)) {
    return NextResponse.json({ error: 'Please enter a valid email' }, { status: 400 })
  }

  const { data: person } = await supabase
    .from('people')
    .select('first_name, last_name, phone, email, sms_opt_in, email_opt_in')
    .eq('id', personId)
    .single()
  if (!person) return NextResponse.json({ error: 'Person not found' }, { status: 404 })

  const update: Record<string, unknown> = { contact_prompted_at: now }
  if (phone && !person.phone) update.phone = phone
  if (email && !person.email) update.email = email
  const phoneOnRecord = (update.phone as string | undefined) ?? person.phone
  const emailOnRecord = (update.email as string | undefined) ?? person.email

  const smsNewlyOptedIn = body.smsConsent === true && !!phoneOnRecord && !person.sms_opt_in
  if (smsNewlyOptedIn) {
    Object.assign(update, { sms_opt_in: true, sms_opt_in_at: now, sms_opt_in_source: 'check_in' })
  }
  if (body.emailConsent === true && emailOnRecord && !person.email_opt_in) {
    Object.assign(update, { email_opt_in: true, email_opt_in_at: now, email_opt_in_source: 'check_in' })
  }

  const { error } = await supabase.from('people').update(update).eq('id', personId)
  if (error) return NextResponse.json({ error: 'Could not save' }, { status: 500 })

  const changes = { ...update }
  delete changes.contact_prompted_at
  if (Object.keys(changes).length > 0) {
    await supabase.from('audit_log').insert({
      action: 'UPDATE',
      table_name: 'people',
      record_id: personId,
      user_email: 'self check-in',
      description: `Contact details from self check-in for ${person.first_name} ${person.last_name}`,
      old_data: {
        phone: person.phone,
        email: person.email,
        sms_opt_in: person.sms_opt_in,
        email_opt_in: person.email_opt_in,
      },
      new_data: changes,
    })
  }

  if (smsNewlyOptedIn) {
    try {
      await sendSmsConfirmation(digits(phoneOnRecord as string))
    } catch {
      // Don't fail the check-in prompt if the confirmation text fails
    }
  }

  return NextResponse.json({ success: true })
}

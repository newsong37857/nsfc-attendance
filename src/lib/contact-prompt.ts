// After someone checks themselves in, ask once (then not again for 8 weeks)
// for whatever we're missing: a phone, an email, or consent to text the phone
// we already have. Server-only.

import type { SupabaseClient } from '@supabase/supabase-js'

const ASK_AGAIN_AFTER_DAYS = 56

export const SMS_CONFIRMATION_TEXT =
  "New Song Fellowship Church: You're subscribed to text updates! We'll send up to 4 msgs/month. Reply STOP to opt out. Reply HELP for help. Msg & data rates may apply."

/** What the check-in screen may show. Never the full phone or email. */
export type ContactPrompt = {
  needsPhone: boolean
  needsEmail: boolean
  /** Phone is on file but they haven't agreed to texts; shows "ending in 1234". */
  phoneLast4: string | null
  askSmsConsent: boolean
  askEmailConsent: boolean
}

export async function getContactPrompt(
  supabase: SupabaseClient,
  personId: string
): Promise<ContactPrompt | null> {
  const { data: p } = await supabase
    .from('people')
    .select('phone, email, sms_opt_in, email_opt_in, contact_prompted_at')
    .eq('id', personId)
    .single()
  if (!p) return null

  if (p.contact_prompted_at) {
    const days = (Date.now() - new Date(p.contact_prompted_at).getTime()) / 86_400_000
    if (days < ASK_AGAIN_AFTER_DAYS) return null
  }

  const prompt: ContactPrompt = {
    needsPhone: !p.phone,
    needsEmail: !p.email,
    phoneLast4: p.phone && !p.sms_opt_in ? digits(p.phone).slice(-4) : null,
    askSmsConsent: !p.sms_opt_in,
    askEmailConsent: !p.email_opt_in,
  }
  const missingSomething = prompt.needsPhone || prompt.needsEmail || prompt.phoneLast4 !== null
  return missingSomething ? prompt : null
}

export function digits(phone: string): string {
  return phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
}

/** Carriers require a confirmation text right after someone opts in. */
export async function sendSmsConfirmation(phone10: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID
  const from = process.env.TWILIO_PHONE_NUMBER
  if (!sid || !token || (!service && !from)) return

  const body = new URLSearchParams({ To: `+1${phone10}`, Body: SMS_CONFIRMATION_TEXT })
  if (service) body.set('MessagingServiceSid', service)
  else body.set('From', from!)

  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
}

'use client'

import { useEffect, useState } from 'react'
import { apiSend } from '@/lib/api'
import type { ContactPrompt } from '@/lib/contact-prompt'

const INPUT =
  'w-full px-4 py-3 bg-gray-50 rounded-xl text-[#10454f] text-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3a9ca1]/30'

// On a shared lobby device, close by itself if the person walks away.
const IDLE_CLOSE_MS = 90_000

/**
 * Shown after a self check-in when we're missing a phone, an email, or
 * consent to text. Asks only for what's missing. "Not now" means we won't ask
 * again for 8 weeks.
 */
export default function ContactPromptSheet({
  personId,
  firstName,
  prompt,
  onClose,
}: {
  personId: string
  firstName: string
  prompt: ContactPrompt
  onClose: () => void
}) {
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [smsConsent, setSmsConsent] = useState(false)
  const [emailConsent, setEmailConsent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const timer = setTimeout(onClose, IDLE_CLOSE_MS)
    return () => clearTimeout(timer)
  }, [phone, email, smsConsent, emailConsent, onClose])

  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(onClose, 2500)
    return () => clearTimeout(timer)
  }, [saved, onClose])

  const hasPhone = !prompt.needsPhone || phone.trim().length > 0
  const hasEmail = !prompt.needsEmail || email.trim().length > 0
  const canSave =
    phone.trim() || email.trim() || (smsConsent && hasPhone) || (emailConsent && hasEmail)

  const dismiss = async () => {
    onClose()
    try {
      await apiSend('/api/contact', 'POST', { personId, dismissed: true })
    } catch {
      // Worst case we ask again next week
    }
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await apiSend('/api/contact', 'POST', {
        personId,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        smsConsent: smsConsent && hasPhone,
        emailConsent: emailConsent && hasEmail,
      })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50 fade-in" onClick={dismiss} />
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl slide-up max-h-[90vh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {saved ? (
          <div className="px-6 pt-4 pb-12 text-center">
            <div className="w-16 h-16 rounded-full bg-[#3a9ca1]/15 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-[#3a9ca1]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-[#10454f]">Thanks, {firstName}!</h2>
            <p className="text-gray-500 mt-1">You&apos;re all set.</p>
          </div>
        ) : (
          <div className="px-6 pb-8">
            <h2 className="text-xl font-bold text-[#10454f] mb-1">Welcome, {firstName}!</h2>
            <p className="text-gray-500 mb-5">
              Want event reminders and church updates? It only takes a second.
            </p>

            {prompt.needsPhone && (
              <div className="mb-3">
                <label htmlFor="cp-phone" className="text-xs font-medium text-gray-500 mb-1 block">
                  Mobile number
                </label>
                <input
                  id="cp-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(423) 555-1234"
                  className={INPUT}
                />
              </div>
            )}

            {prompt.needsEmail && (
              <div className="mb-4">
                <label htmlFor="cp-email" className="text-xs font-medium text-gray-500 mb-1 block">
                  Email
                </label>
                <input
                  id="cp-email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  autoCapitalize="none"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={INPUT}
                />
              </div>
            )}

            <div className="space-y-4 rounded-2xl bg-[#fffff0] border border-[#3a9ca1]/20 p-4 mb-5">
              {prompt.askSmsConsent && hasPhone && (
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={smsConsent}
                    onChange={(e) => setSmsConsent(e.target.checked)}
                    className="mt-1 h-5 w-5 shrink-0 accent-[#1f6d73]"
                  />
                  <span className="text-sm text-gray-600 leading-snug">
                    Text me updates
                    {prompt.phoneLast4 && !phone.trim() && ` at my number ending in ${prompt.phoneLast4}`}
                    . I agree to receive text messages from New Song Fellowship Church. Up to 4
                    msgs/month. Msg &amp; data rates may apply. Reply STOP to cancel, HELP for help.
                    Consent is not a condition of membership or participation. Privacy policy:
                    newsongtn.cc/privacy-policy
                  </span>
                </label>
              )}
              {prompt.askEmailConsent && hasEmail && (
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={emailConsent}
                    onChange={(e) => setEmailConsent(e.target.checked)}
                    className="mt-1 h-5 w-5 shrink-0 accent-[#1f6d73]"
                  />
                  <span className="text-sm text-gray-600 leading-snug">
                    Email me the monthly newsletter and announcements. Unsubscribe anytime.
                  </span>
                </label>
              )}
              {!(prompt.askSmsConsent && hasPhone) && !(prompt.askEmailConsent && hasEmail) && (
                <p className="text-sm text-gray-500">
                  Enter a number or email above to choose how we keep in touch.
                </p>
              )}
            </div>

            {error && <p className="text-sm text-red-600 mb-3 text-center">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={dismiss}
                className="flex-1 py-4 border-2 border-gray-200 text-gray-500 rounded-2xl font-semibold transition-all active:scale-95"
              >
                Not now
              </button>
              <button
                onClick={save}
                disabled={!canSave || saving}
                className="flex-1 py-4 bg-[#3a9ca1] text-white rounded-2xl font-semibold disabled:opacity-30 transition-all active:scale-95"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

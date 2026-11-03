'use client'

import { useState } from 'react'

export type NewChild = {
  first_name: string
  last_name: string
  date_of_birth: string
  allergies: string
  care_notes: string
}

export type NewFamily = {
  guardian: { first_name: string; last_name: string; phone: string; sms_consent: boolean }
  children: NewChild[]
}

const blankChild = (): NewChild => ({ first_name: '', last_name: '', date_of_birth: '', allergies: '', care_notes: '' })

const inputClass =
  'kids-focus w-full min-h-[64px] rounded-2xl border-2 border-[#cfe3e1] bg-white px-5 text-[22px] text-[#10454f] placeholder:text-[#7c9b98] focus:border-[#3a9ca1] focus:outline-none'
const labelClass = 'block text-lg font-medium text-[#10454f] mb-2'

/** First Sunday: the parent adds themselves and their children in one go. */
export default function NewFamilyForm({
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  busy: boolean
  error: string | null
  onCancel: () => void
  onSubmit: (family: NewFamily) => void
}) {
  const [guardian, setGuardian] = useState({ first_name: '', last_name: '', phone: '', sms_consent: false })
  const [children, setChildren] = useState<NewChild[]>([blankChild()])

  const setChild = (i: number, patch: Partial<NewChild>) =>
    setChildren((list) => list.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  const phoneDigits = guardian.phone.replace(/\D/g, '')
  const ready =
    guardian.first_name.trim() &&
    guardian.last_name.trim() &&
    phoneDigits.length >= 10 &&
    children.some((c) => c.first_name.trim())

  return (
    <form
      className="mx-auto w-full max-w-[760px] space-y-10 pb-40"
      onSubmit={(e) => {
        e.preventDefault()
        if (ready && !busy) onSubmit({ guardian, children: children.filter((c) => c.first_name.trim()) })
      }}
    >
      <div>
        <h1 className="text-[40px] font-semibold leading-tight text-[#10454f]">Welcome to New Song</h1>
        <p className="mt-2 text-xl text-[#1f6d73]">
          Tell us who you are and who&apos;s staying with us. It takes a minute, and next Sunday it&apos;s just your phone number.
        </p>
      </div>

      <fieldset className="space-y-5">
        <legend className="text-[26px] font-semibold text-[#10454f] mb-4">You</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="g-first" className={labelClass}>First name</label>
            <input id="g-first" className={inputClass} autoComplete="given-name" value={guardian.first_name}
              onChange={(e) => setGuardian({ ...guardian, first_name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="g-last" className={labelClass}>Last name</label>
            <input id="g-last" className={inputClass} autoComplete="family-name" value={guardian.last_name}
              onChange={(e) => setGuardian({ ...guardian, last_name: e.target.value })} />
          </div>
        </div>
        <div>
          <label htmlFor="g-phone" className={labelClass}>Mobile number</label>
          <input id="g-phone" className={inputClass} type="tel" inputMode="tel" autoComplete="tel" value={guardian.phone}
            onChange={(e) => setGuardian({ ...guardian, phone: e.target.value })} />
          <p className="mt-2 text-lg text-[#1f6d73]">So we can reach you during the service if your child needs you.</p>
        </div>
        <label className="flex items-start gap-4 rounded-2xl border-2 border-[#cfe3e1] bg-white p-5 text-lg text-[#10454f]">
          <input
            type="checkbox"
            className="mt-1 h-7 w-7 shrink-0 accent-[#1f6d73]"
            checked={guardian.sms_consent}
            onChange={(e) => setGuardian({ ...guardian, sms_consent: e.target.checked })}
          />
          <span>
            New Song may text me my pickup code and up to 4 updates a month. Msg &amp; data rates may apply. Reply STOP to
            opt out.
          </span>
        </label>
      </fieldset>

      {children.map((c, i) => (
        <fieldset key={i} className="space-y-5">
          <div className="flex items-baseline justify-between">
            <legend className="text-[26px] font-semibold text-[#10454f]">
              {children.length > 1 ? `Child ${i + 1}` : 'Your child'}
            </legend>
            {children.length > 1 && (
              <button type="button" className="kids-focus min-h-[48px] px-3 text-lg text-[#1f6d73] underline underline-offset-4"
                onClick={() => setChildren((list) => list.filter((_, j) => j !== i))}>
                Remove
              </button>
            )}
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor={`c-first-${i}`} className={labelClass}>First name</label>
              <input id={`c-first-${i}`} className={inputClass} value={c.first_name}
                onChange={(e) => setChild(i, { first_name: e.target.value })} />
            </div>
            <div>
              <label htmlFor={`c-last-${i}`} className={labelClass}>Last name</label>
              <input id={`c-last-${i}`} className={inputClass} placeholder={guardian.last_name || 'Same as yours'} value={c.last_name}
                onChange={(e) => setChild(i, { last_name: e.target.value })} />
            </div>
          </div>
          <div>
            <label htmlFor={`c-dob-${i}`} className={labelClass}>Birthday</label>
            <input id={`c-dob-${i}`} className={inputClass} type="date" value={c.date_of_birth}
              onChange={(e) => setChild(i, { date_of_birth: e.target.value })} />
            <p className="mt-2 text-lg text-[#1f6d73]">We use it to put them in the right room.</p>
          </div>
          <div>
            <label htmlFor={`c-allergy-${i}`} className={labelClass}>Allergies</label>
            <input id={`c-allergy-${i}`} className={inputClass} placeholder="None" value={c.allergies}
              onChange={(e) => setChild(i, { allergies: e.target.value })} />
          </div>
          <div>
            <label htmlFor={`c-care-${i}`} className={labelClass}>Anything the volunteers should know?</label>
            <textarea id={`c-care-${i}`} rows={2} className={`${inputClass} py-4`} placeholder="Medicine, needs, what helps when they're upset"
              value={c.care_notes} onChange={(e) => setChild(i, { care_notes: e.target.value })} />
          </div>
        </fieldset>
      ))}

      {children.length < 6 && (
        <button type="button" onClick={() => setChildren((list) => [...list, blankChild()])}
          className="kids-focus min-h-[72px] w-full rounded-2xl border-2 border-dashed border-[#3a9ca1] text-xl font-medium text-[#1f6d73]">
          Add another child
        </button>
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-[#cfe3e1] bg-[#fffff0]/95 backdrop-blur px-6 py-5">
        <div className="mx-auto flex max-w-[760px] items-center gap-4">
          <button type="button" onClick={onCancel} className="kids-focus min-h-[80px] px-6 text-xl font-medium text-[#1f6d73]">
            Back
          </button>
          {error && <p role="alert" className="flex-1 text-lg font-medium text-[#7a4f0e]">{error}</p>}
          <button type="submit" disabled={!ready || busy}
            className="kids-focus ml-auto min-h-[80px] rounded-2xl bg-[#1f6d73] px-10 text-[22px] font-semibold text-white disabled:bg-[#9fbfbc]">
            {busy ? 'Checking in…' : 'Save and check in'}
          </button>
        </div>
      </div>
    </form>
  )
}

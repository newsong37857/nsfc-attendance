'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet, apiSend, ApiError } from '@/lib/api'
import type { Event } from '@/lib/supabase'
import type { Family } from '@/app/api/kids/families/route'
import Keypad from '@/components/kids/Keypad'
import PickupStub, { type StubChild } from '@/components/kids/PickupStub'
import NewFamilyForm, { type NewFamily } from '@/components/kids/NewFamilyForm'

type Screen =
  | { name: 'find' }
  | { name: 'search' }
  | { name: 'choose'; families: Family[] }
  | { name: 'family'; family: Family }
  | { name: 'new' }
  | { name: 'code'; code: string; children: StubChild[]; alreadyIn: string[]; guardianId: string; canText: boolean }

type CheckInResponse = {
  code: string
  children: StubChild[]
  alreadyIn: string[]
  canText: boolean
  guardianId?: string
}

/** Back to the start after this long without a tap, so the next family starts clean. */
const IDLE_MS = 90_000

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export default function KidsCheckInPage() {
  const [event, setEvent] = useState<Event | null>(null)
  const [loadingEvent, setLoadingEvent] = useState(true)
  const [screen, setScreen] = useState<Screen>({ name: 'find' })
  const [digits, setDigits] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [alsoMe, setAlsoMe] = useState(true)
  const [textState, setTextState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reset = useCallback(() => {
    setScreen({ name: 'find' })
    setDigits('')
    setQuery('')
    setMessage(null)
    setBusy(false)
    setTextState('idle')
  }, [])

  // Any tap pushes the idle timer back; a quiet screen returns to the start.
  useEffect(() => {
    const bump = () => {
      if (idle.current) clearTimeout(idle.current)
      idle.current = setTimeout(reset, IDLE_MS)
    }
    bump()
    window.addEventListener('pointerdown', bump)
    window.addEventListener('keydown', bump)
    return () => {
      if (idle.current) clearTimeout(idle.current)
      window.removeEventListener('pointerdown', bump)
      window.removeEventListener('keydown', bump)
    }
  }, [reset])

  useEffect(() => {
    apiGet<{ events: Event[]; currentEventId: string | null; today: string }>('/api/events')
      .then(({ events, currentEventId, today }) => {
        const current = events.find((e) => e.id === currentEventId)
        setEvent(current && current.event_date === today ? current : null)
      })
      .catch(() => setEvent(null))
      .finally(() => setLoadingEvent(false))
  }, [])

  const showFamilies = (families: Family[]) => {
    if (families.length === 1) openFamily(families[0])
    else setScreen({ name: 'choose', families })
  }

  const openFamily = (family: Family) => {
    setSelected(new Set(family.children.filter((c) => !c.checkedIn).map((c) => c.id)))
    setAlsoMe(true)
    setMessage(null)
    setScreen({ name: 'family', family })
  }

  const findByPhone = async (last4: string) => {
    if (!event) return
    setBusy(true)
    setMessage(null)
    try {
      const { families } = await apiGet<{ families: Family[] }>(`/api/kids/families?last4=${last4}&eventId=${event.id}`)
      if (families.length === 0) {
        setMessage(`We couldn't find a family with a phone ending ${last4}.`)
        setDigits('')
      } else {
        showFamilies(families)
      }
    } catch {
      setMessage("Couldn't search just now. Please try again.")
      setDigits('')
    } finally {
      setBusy(false)
    }
  }

  const pressDigit = (d: string) => {
    if (busy || digits.length >= 4) return
    const next = digits + d
    setDigits(next)
    setMessage(null)
    if (next.length === 4) findByPhone(next)
  }

  const searchByName = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!event || query.trim().length < 2) return
    setBusy(true)
    setMessage(null)
    try {
      const { families } = await apiGet<{ families: Family[] }>(
        `/api/kids/families?q=${encodeURIComponent(query.trim())}&eventId=${event.id}`
      )
      if (families.length === 0) setMessage(`No family found for "${query.trim()}".`)
      else showFamilies(families)
    } catch {
      setMessage("Couldn't search just now. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  const showCode = (res: CheckInResponse, guardianId: string) => {
    setTextState('idle')
    setScreen({
      name: 'code',
      code: res.code,
      children: res.children,
      alreadyIn: res.alreadyIn,
      guardianId,
      canText: res.canText,
    })
  }

  const checkIn = async (family: Family) => {
    if (!event || selected.size === 0) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await apiSend<CheckInResponse>('/api/kids/checkin', 'POST', {
        eventId: event.id,
        guardianId: family.guardian.id,
        childIds: Array.from(selected),
        alsoGuardian: alsoMe,
      })
      showCode(res, family.guardian.id)
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Couldn't check in. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  const addFamily = async (family: NewFamily) => {
    if (!event) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await apiSend<CheckInResponse>('/api/kids/family', 'POST', { eventId: event.id, ...family })
      showCode(res, res.guardianId!)
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Couldn't save. Please ask a volunteer.")
    } finally {
      setBusy(false)
    }
  }

  const textCode = async (s: Extract<Screen, { name: 'code' }>) => {
    if (!event) return
    setTextState('sending')
    try {
      const { sent } = await apiSend<{ sent: boolean }>('/api/kids/text-code', 'POST', {
        eventId: event.id,
        guardianId: s.guardianId,
        code: s.code,
      })
      setTextState(sent ? 'sent' : 'failed')
    } catch {
      setTextState('failed')
    }
  }

  const otherWays = (
    <div className="flex flex-wrap gap-4">
      <button type="button" onClick={() => { setMessage(null); setScreen({ name: 'new' }) }}
        className="kids-focus min-h-[80px] rounded-2xl border-2 border-[#1f6d73] bg-white px-7 text-[22px] font-semibold text-[#10454f]">
        First time here? Add your family
      </button>
      <button type="button" onClick={() => { setMessage(null); setScreen({ name: 'search' }) }}
        className="kids-focus min-h-[80px] rounded-2xl border-2 border-[#cfe3e1] bg-white px-7 text-[22px] font-medium text-[#10454f]">
        Search by name
      </button>
    </div>
  )

  if (loadingEvent) {
    return <main className="min-h-screen bg-[#fffff0]" aria-busy="true" />
  }

  if (!event) {
    return (
      <main className="min-h-screen bg-[#fffff0] px-10 py-16 text-[#10454f]">
        <h1 className="text-[40px] font-semibold">Kids check-in opens on service days</h1>
        <p className="mt-3 max-w-[36ch] text-xl text-[#1f6d73]">
          There&apos;s no service on the calendar today. If there should be, a staff member can add it in the office dashboard.
        </p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#fffff0] text-[#10454f] px-6 sm:px-10 pt-8 pb-10">
      {screen.name === 'find' && (
        <div className="mx-auto flex max-w-[1000px] flex-col gap-10 landscape:min-h-[calc(100vh-4.5rem)] landscape:flex-row landscape:items-center">
          <section className="flex-1 min-w-0">
            <h1 className="text-[44px] font-semibold leading-[1.1]">Checking in your kids?</h1>
            <p className="mt-3 text-[22px] text-[#1f6d73]">Enter the last 4 digits of your phone.</p>
            <div className="mt-8 flex gap-4" aria-live="polite" aria-label={`${digits.length} of 4 digits entered`}>
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`flex h-[88px] w-[72px] items-center justify-center rounded-2xl border-2 text-[44px] font-semibold ${
                    digits[i] ? 'border-[#10454f] bg-white' : i === digits.length ? 'border-[#3a9ca1] bg-white' : 'border-[#cfe3e1]'
                  }`}
                >
                  {digits[i] ?? ''}
                </span>
              ))}
            </div>
            <p role="status" className="mt-5 min-h-[30px] text-xl font-medium text-[#7a4f0e]">
              {busy ? <span className="text-[#1f6d73]">Looking…</span> : message}
            </p>
            <div className="mt-6 portrait:hidden">{otherWays}</div>
          </section>
          <section className="flex w-full shrink-0 justify-center landscape:w-[420px] landscape:justify-end">
            <Keypad onDigit={pressDigit} onDelete={() => setDigits((d) => d.slice(0, -1))} disabled={busy} />
          </section>
          {/* Portrait: below the keypad, so the eye goes digits → keypad first. */}
          <div className="landscape:hidden flex justify-center">{otherWays}</div>
        </div>
      )}

      {screen.name === 'search' && (
        <div className="mx-auto max-w-[760px]">
          <h1 className="text-[40px] font-semibold leading-tight">Find your family</h1>
          <form onSubmit={searchByName} className="mt-8 flex gap-4">
            <label htmlFor="name-search" className="sr-only">Your name or your child&apos;s name</label>
            <input
              id="name-search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Your name or your child's"
              autoComplete="off"
              className="kids-focus min-h-[80px] flex-1 rounded-2xl border-2 border-[#cfe3e1] bg-white px-6 text-[26px] focus:border-[#3a9ca1] focus:outline-none"
            />
            <button type="submit" disabled={busy || query.trim().length < 2}
              className="kids-focus min-h-[80px] rounded-2xl bg-[#1f6d73] px-8 text-[22px] font-semibold text-white disabled:bg-[#9fbfbc]">
              Find
            </button>
          </form>
          <p role="status" className="mt-5 min-h-[30px] text-xl font-medium text-[#7a4f0e]">{message}</p>
          <button type="button" onClick={reset} className="kids-focus mt-6 min-h-[64px] text-xl font-medium text-[#1f6d73]">
            Back
          </button>
        </div>
      )}

      {screen.name === 'choose' && (
        <div className="mx-auto max-w-[760px]">
          <h1 className="text-[40px] font-semibold leading-tight">Which one is you?</h1>
          <ul className="mt-8 space-y-4">
            {screen.families.map((f) => (
              <li key={f.guardian.id}>
                <button type="button" onClick={() => openFamily(f)}
                  className="kids-focus flex min-h-[96px] w-full items-center justify-between gap-6 rounded-2xl border-2 border-[#cfe3e1] bg-white px-7 text-left">
                  <span className="text-[30px] font-semibold">{f.guardian.first_name} {f.guardian.last_name}</span>
                  <span className="text-xl text-[#1f6d73]">{joinNames(f.children.map((c) => c.first_name))}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={reset} className="kids-focus mt-8 min-h-[64px] text-xl font-medium text-[#1f6d73]">
            None of these, start over
          </button>
        </div>
      )}

      {screen.name === 'family' && (() => {
        const { family } = screen
        const chosen = family.children.filter((c) => selected.has(c.id))
        const allIn = family.children.every((c) => c.checkedIn)
        return (
          <div className="mx-auto max-w-[900px] pb-40">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h1 className="text-[44px] font-semibold leading-tight">Hi {family.guardian.first_name}</h1>
                <p className="mt-2 text-[22px] text-[#1f6d73]">Who&apos;s staying with us today?</p>
              </div>
              <button type="button" onClick={reset} className="kids-focus min-h-[56px] shrink-0 text-xl font-medium text-[#1f6d73] underline underline-offset-[6px]">
                Not you?
              </button>
            </div>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {family.children.map((c) => {
                const on = selected.has(c.id)
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={c.checkedIn}
                      aria-pressed={on}
                      onClick={() =>
                        setSelected((s) => {
                          const next = new Set(s)
                          if (next.has(c.id)) next.delete(c.id)
                          else next.add(c.id)
                          return next
                        })
                      }
                      className={`kids-focus relative flex h-full min-h-[132px] w-full flex-col items-start justify-center rounded-3xl border-2 px-7 py-5 text-left ${
                        c.checkedIn
                          ? 'border-[#cfe3e1] bg-transparent text-[#7c9b98]'
                          : on
                            ? 'border-[#10454f] bg-[#10454f] text-[#fffff0]'
                            : 'border-[#cfe3e1] bg-white text-[#10454f]'
                      }`}
                    >
                      <span className="text-[32px] font-semibold leading-tight">{c.first_name}</span>
                      <span className={`mt-1 text-xl ${on && !c.checkedIn ? 'text-[#9fd3d0]' : 'text-[#1f6d73]'}`}>
                        {c.checkedIn ? 'Already checked in' : [c.age, c.room ?? 'A volunteer will choose the room'].filter(Boolean).join(', ')}
                      </span>
                      {c.hasAllergy && !c.checkedIn && (
                        <span className="mt-3 rounded-lg bg-[#fbf3e4] px-3 py-1 text-lg font-medium text-[#7a4f0e]">Allergy on file</span>
                      )}
                      {on && !c.checkedIn && (
                        <svg className="absolute right-6 top-6" width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <circle cx="12" cy="12" r="11" fill="#3a9ca1" />
                          <path d="M7 12.5l3.2 3.2L17 9" stroke="#fffff0" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className="mt-6 text-lg text-[#1f6d73]">
              {allIn
                ? 'Everyone is already checked in. Lost the pickup code? A room leader can help at the door.'
                : 'Something changed, like a new allergy? Tell the volunteer at the door.'}
            </p>

            <div className="fixed inset-x-0 bottom-0 border-t border-[#cfe3e1] bg-[#fffff0]/95 backdrop-blur px-6 sm:px-10 py-5">
              <div className="mx-auto flex max-w-[900px] flex-wrap items-center gap-4">
                <label className={`flex min-h-[72px] items-center gap-4 text-xl ${allIn ? 'invisible' : ''}`}>
                  <input type="checkbox" checked={alsoMe} onChange={(e) => setAlsoMe(e.target.checked)}
                    className="h-8 w-8 accent-[#1f6d73]" />
                  Check me in too
                </label>
                {message && <p role="alert" className="text-lg font-medium text-[#7a4f0e]">{message}</p>}
                <button type="button" disabled={busy || (!allIn && chosen.length === 0)} onClick={() => (allIn ? reset() : checkIn(family))}
                  className="kids-focus ml-auto min-h-[88px] rounded-2xl bg-[#1f6d73] px-10 text-[24px] font-semibold text-white disabled:bg-[#9fbfbc]">
                  {allIn
                    ? 'Done'
                    : busy
                    ? 'Checking in…'
                    : chosen.length === 0
                      ? 'Choose who is staying'
                      : `Check in ${joinNames(chosen.map((c) => c.first_name))}`}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {screen.name === 'new' && (
        <NewFamilyForm busy={busy} error={message} onCancel={reset} onSubmit={addFamily} />
      )}

      {screen.name === 'code' && (
        <div className="mx-auto flex max-w-[900px] flex-col items-center gap-8 pt-4">
          <h1 className="self-start text-[40px] font-semibold leading-tight">
            {joinNames(screen.children.map((c) => c.first_name))} {screen.children.length === 1 ? 'is' : 'are'} checked in
          </h1>
          <PickupStub code={screen.code} kids={screen.children} />
          <div className="w-full max-w-[820px] space-y-3 text-[22px] leading-snug">
            <p>
              Show this to the volunteer at the door. They&apos;ll write <strong className="kids-code text-[24px]">{screen.code}</strong> on{' '}
              {screen.children.length === 1 ? `${screen.children[0].first_name}'s sticker` : 'each sticker'}.
            </p>
            <p className="text-[#1f6d73]">
              Keep the code for pickup: take a photo of this screen{screen.canText ? ', or have it texted to you' : ''}.
            </p>
            {screen.alreadyIn.length > 0 && (
              <p className="text-[#1f6d73]">
                {joinNames(screen.alreadyIn)} {screen.alreadyIn.length === 1 ? 'was' : 'were'} already checked in and
                {screen.alreadyIn.length === 1 ? ' keeps' : ' keep'} the earlier code.
              </p>
            )}
          </div>
          <div className="flex w-full max-w-[820px] flex-wrap items-center gap-4">
            {screen.canText && (
              <button type="button" disabled={textState === 'sending' || textState === 'sent'} onClick={() => textCode(screen)}
                className="kids-focus min-h-[80px] rounded-2xl border-2 border-[#1f6d73] px-8 text-[22px] font-semibold text-[#1f6d73] disabled:opacity-60">
                {textState === 'sending' ? 'Sending…' : textState === 'sent' ? 'Texted' : 'Text it to me'}
              </button>
            )}
            {textState === 'failed' && (
              <p role="alert" className="text-lg font-medium text-[#7a4f0e]">The text didn&apos;t send. Please take a photo instead.</p>
            )}
            <button type="button" onClick={reset}
              className="kids-focus ml-auto min-h-[80px] rounded-2xl bg-[#1f6d73] px-12 text-[22px] font-semibold text-white">
              Done
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

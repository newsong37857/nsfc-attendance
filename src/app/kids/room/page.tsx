'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiSend, ApiError } from '@/lib/api'
import type { Event } from '@/lib/supabase'
import type { RoomChild } from '@/app/api/kids/room/route'

type Room = { id: string; name: string }
type Match = { checkinId: string; childId: string; first_name: string; roomId: string | null }

const ROOM_KEY = 'nsfc-kids-room'
const REFRESH_MS = 30_000

function readRoom(): string | null {
  try {
    return localStorage.getItem(ROOM_KEY)
  } catch {
    return null
  }
}
function saveRoom(id: string | null) {
  try {
    if (id) localStorage.setItem(ROOM_KEY, id)
    else localStorage.removeItem(ROOM_KEY)
  } catch {
    /* private mode: the room just isn't remembered */
  }
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

export default function KidsRoomPage() {
  const [event, setEvent] = useState<Event | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [roomId, setRoomId] = useState<string | null>(null)
  const [children, setChildren] = useState<RoomChild[]>([])
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [override, setOverride] = useState<RoomChild | null>(null)
  const [openNotes, setOpenNotes] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      apiGet<{ events: Event[]; currentEventId: string | null; today: string }>('/api/events'),
      apiGet<{ rooms: Room[] }>('/api/kids/room'),
    ])
      .then(([{ events, currentEventId, today }, { rooms }]) => {
        const current = events.find((e) => e.id === currentEventId)
        setEvent(current && current.event_date === today ? current : null)
        setRooms(rooms)
        const saved = readRoom()
        setRoomId(saved && rooms.some((r) => r.id === saved) ? saved : null)
      })
      .catch(() => setEvent(null))
      .finally(() => setLoading(false))
  }, [])

  const load = useCallback(async () => {
    if (!event || !roomId) return
    try {
      const res = await apiGet<{ children: RoomChild[] }>(`/api/kids/room?eventId=${event.id}&roomId=${roomId}`)
      setChildren(res.children)
    } catch {
      /* keep the last list; the next refresh tries again */
    }
  }, [event, roomId])

  useEffect(() => {
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  const flash = (text: string) => {
    setToast(text)
    setTimeout(() => setToast(null), 4000)
  }

  const lookUp = async (value: string) => {
    if (!event) return
    setBusy(true)
    setCodeError(null)
    try {
      const res = await apiSend<{ matches: Match[] }>('/api/kids/checkout', 'POST', { action: 'match', eventId: event.id, code: value })
      setMatches(res.matches)
    } catch (err) {
      setCodeError(err instanceof ApiError ? err.message : "Couldn't check the code. Try again.")
      setMatches(null)
    } finally {
      setBusy(false)
    }
  }

  const typeCode = (raw: string) => {
    const value = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
    setCode(value)
    setMatches(null)
    setCodeError(null)
    if (value.length === 4) lookUp(value)
  }

  const release = async (ids: string[]) => {
    if (!event) return
    setBusy(true)
    try {
      const res = await apiSend<{ released: string[] }>('/api/kids/checkout', 'POST', {
        action: 'release',
        eventId: event.id,
        code,
        checkinIds: ids,
      })
      flash(`${res.released.join(' and ')} picked up`)
      setCode('')
      setMatches(null)
      load()
    } catch (err) {
      setCodeError(err instanceof ApiError ? err.message : "Couldn't check out. Try again.")
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <main className="min-h-screen bg-[#fffff0]" aria-busy="true" />

  if (!event) {
    return (
      <main className="min-h-screen bg-[#fffff0] px-8 py-14 text-[#10454f]">
        <h1 className="text-[36px] font-semibold">No service today</h1>
        <p className="mt-2 text-xl text-[#1f6d73]">The room screen shows children checked in to today&apos;s service.</p>
      </main>
    )
  }

  if (!roomId) {
    return (
      <main className="min-h-screen bg-[#fffff0] px-8 py-14 text-[#10454f]">
        <h1 className="text-[36px] font-semibold">Which room is this?</h1>
        <p className="mt-2 text-xl text-[#1f6d73]">This device will remember it.</p>
        <ul className="mt-8 grid max-w-[720px] gap-4 sm:grid-cols-2">
          {rooms.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => { saveRoom(r.id); setRoomId(r.id) }}
                className="kids-focus min-h-[112px] w-full rounded-3xl border-2 border-[#cfe3e1] bg-white px-7 text-left text-[30px] font-semibold">
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      </main>
    )
  }

  const roomName = rooms.find((r) => r.id === roomId)?.name ?? 'Room'
  const here = children.filter((c) => !c.checkedOutAt)
  const gone = children.filter((c) => c.checkedOutAt)
  const inThisRoom = (matches ?? []).filter((m) => m.roomId === roomId)
  const elsewhere = (matches ?? []).filter((m) => m.roomId !== roomId)

  return (
    <main className="min-h-screen bg-[#fffff0] text-[#10454f]">
      <header className="flex flex-wrap items-end justify-between gap-4 bg-[#10454f] px-8 pb-6 pt-8 text-[#fffff0]">
        <div>
          <h1 className="text-[40px] font-semibold leading-none">{roomName}</h1>
          <p className="mt-2 text-xl text-[#9fd3d0]">
            {here.length} here{gone.length > 0 ? `, ${gone.length} picked up` : ''}
          </p>
        </div>
        <button type="button" onClick={() => { saveRoom(null); setRoomId(null); setChildren([]) }}
          className="kids-focus min-h-[56px] text-lg text-[#9fd3d0] underline underline-offset-4">
          Change room
        </button>
      </header>

      <section aria-labelledby="pickup-heading" className="border-b border-[#cfe3e1] px-8 py-6">
        <h2 id="pickup-heading" className="text-2xl font-semibold">Pickup</h2>
        <div className="mt-3 flex flex-wrap items-center gap-5">
          <label htmlFor="pickup-code" className="sr-only">Pickup code from the parent</label>
          <input
            id="pickup-code"
            value={code}
            onChange={(e) => typeCode(e.target.value)}
            placeholder="Code"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="kids-focus kids-code min-h-[88px] w-[300px] rounded-2xl border-2 border-[#cfe3e1] bg-white px-6 text-[52px] uppercase placeholder:normal-case placeholder:text-[#b9cfcc] placeholder:font-medium placeholder:tracking-normal focus:border-[#3a9ca1] focus:outline-none"
          />
          <p className="text-lg text-[#1f6d73] max-w-[34ch]">Type the code on the parent&apos;s photo or text. It must match the child&apos;s sticker.</p>
        </div>
        {busy && <p className="mt-3 text-lg text-[#1f6d73]">Checking…</p>}
        {codeError && <p role="alert" className="mt-3 text-lg font-medium text-[#7a4f0e]">{codeError}</p>}
        {matches && (
          <div className="mt-5 space-y-3">
            {inThisRoom.length > 0 ? (
              <button type="button" disabled={busy} onClick={() => release(inThisRoom.map((m) => m.checkinId))}
                className="kids-focus min-h-[88px] rounded-2xl bg-[#1f6d73] px-10 text-[24px] font-semibold text-white disabled:bg-[#9fbfbc]">
                Release {inThisRoom.map((m) => m.first_name).join(' and ')}
              </button>
            ) : (
              <p className="text-xl">Nobody in {roomName} has this code.</p>
            )}
            {elsewhere.length > 0 && (
              <p className="text-lg text-[#1f6d73]">
                Same code, other room: {elsewhere.map((m) => m.first_name).join(', ')}. The parent collects them there.
              </p>
            )}
          </div>
        )}
      </section>

      <section aria-label="Children in this room" className="px-8 py-6">
        {here.length === 0 && (
          <p className="text-xl text-[#1f6d73]">
            {gone.length > 0 ? 'Everyone has been picked up.' : `No children checked in to ${roomName} yet.`}
          </p>
        )}
        <ul className="divide-y divide-[#cfe3e1]">
          {here.map((c) => (
            <li key={c.checkinId} className="flex gap-5 py-5">
              <div className="h-[88px] w-[88px] shrink-0 overflow-hidden rounded-2xl bg-[#e8f2f1]">
                {c.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket
                  <img src={c.photoUrl} alt={`Photo of ${c.first_name}`} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[34px] font-semibold text-[#1f6d73]" aria-hidden="true">
                    {c.first_name[0]}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-baseline gap-x-4">
                  <p className="text-[28px] font-semibold leading-tight">{c.first_name} {c.last_name}</p>
                  <p className="text-lg text-[#1f6d73]">{[c.age, `in at ${timeOf(c.checkedInAt)}`].filter(Boolean).join(', ')}</p>
                </div>
                {c.allergies && (
                  <p className="rounded-xl bg-[#fbf3e4] px-4 py-2 text-xl font-medium text-[#7a4f0e]">Allergy: {c.allergies}</p>
                )}
                {c.careNotes && (
                  openNotes === c.checkinId ? (
                    <p className="whitespace-pre-line text-lg">{c.careNotes}</p>
                  ) : (
                    <button type="button" onClick={() => setOpenNotes(c.checkinId)}
                      className="kids-focus min-h-[44px] text-lg font-medium text-[#1f6d73] underline underline-offset-4">
                      Read care notes
                    </button>
                  )
                )}
                <p className="text-lg">
                  {c.guardians.map((g, i) => (
                    <span key={i}>
                      {i > 0 && ', '}
                      {g.name}
                      {g.phone && (
                        <> (<a className="text-[#1f6d73] underline underline-offset-4" href={telHref(g.phone)}>{g.phone}</a>)</>
                      )}
                    </span>
                  ))}
                </p>
              </div>
              <button type="button" onClick={() => setOverride(c)}
                className="kids-focus min-h-[56px] shrink-0 self-start rounded-xl px-3 text-lg text-[#1f6d73] underline underline-offset-4">
                No code?
              </button>
            </li>
          ))}
        </ul>

        {gone.length > 0 && (
          <details className="mt-6">
            <summary className="kids-focus min-h-[56px] cursor-pointer text-xl font-medium text-[#1f6d73]">
              Picked up ({gone.length})
            </summary>
            <ul className="mt-2 space-y-2 text-lg text-[#1f6d73]">
              {gone.map((c) => (
                <li key={c.checkinId}>
                  {c.first_name} {c.last_name}, {timeOf(c.checkedOutAt!)}{c.method === 'override' ? ', released by a leader' : ''}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {override && (
        <OverrideSheet
          eventId={event.id}
          child={override}
          onClose={() => setOverride(null)}
          onDone={(name) => {
            setOverride(null)
            flash(`${name} released by a leader`)
            load()
          }}
        />
      )}

      {toast && (
        <div role="status" className="toast-in fixed bottom-8 left-1/2 -translate-x-1/2 rounded-2xl bg-[#10454f] px-8 py-4 text-xl text-[#fffff0]">
          {toast}
        </div>
      )}
    </main>
  )
}

function OverrideSheet({
  eventId,
  child,
  onClose,
  onDone,
}: {
  eventId: string
  child: RoomChild
  onClose: () => void
  onDone: (name: string) => void
}) {
  const [leader, setLeader] = useState('')
  const [reason, setReason] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const field =
    'kids-focus w-full min-h-[64px] rounded-2xl border-2 border-[#cfe3e1] bg-white px-5 text-[22px] focus:border-[#3a9ca1] focus:outline-none'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await apiSend('/api/kids/checkout', 'POST', {
        action: 'override',
        eventId,
        checkinId: child.checkinId,
        leaderPin: pin,
        leaderName: leader,
        reason,
      })
      onDone(child.first_name)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't release. Try again.")
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  const adults = [
    ...child.guardians.map((g) => ({ name: g.name, note: 'Parent or guardian' })),
    ...child.pickups.map((p) => ({ name: p.name, note: p.relationship ?? 'Authorised pickup' })),
  ]

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="override-title">
      <div className="absolute inset-0 bg-[#10454f]/50 fade-in" onClick={onClose} />
      <form onSubmit={submit} className="slide-up absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-[32px] bg-[#fffff0] px-8 pb-10 pt-8 text-[#10454f]">
        <h2 id="override-title" className="text-[32px] font-semibold leading-tight">Release {child.first_name} without a code</h2>
        <p className="mt-2 text-xl text-[#1f6d73]">
          Only a room leader or staff member. Make sure the adult is on this list, and check ID if you don&apos;t know them.
        </p>
        <ul className="mt-5 space-y-2">
          {adults.map((a, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-3 rounded-xl bg-white px-5 py-3 text-xl">
              <span className="font-semibold">{a.name}</span>
              <span className="text-lg text-[#1f6d73]">{a.note}</span>
            </li>
          ))}
          {adults.length === 0 && <li className="text-xl text-[#7a4f0e]">No adults on file. Fetch a staff member.</li>}
        </ul>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="leader-name" className="mb-2 block text-lg font-medium">Your name</label>
            <input id="leader-name" className={field} value={leader} onChange={(e) => setLeader(e.target.value)} autoComplete="name" />
          </div>
          <div>
            <label htmlFor="leader-pin" className="mb-2 block text-lg font-medium">Leader PIN</label>
            <input id="leader-pin" className={field} type="password" inputMode="numeric" autoComplete="off" value={pin}
              onChange={(e) => setPin(e.target.value)} />
          </div>
        </div>
        <div className="mt-5">
          <label htmlFor="leader-reason" className="mb-2 block text-lg font-medium">Why there&apos;s no code</label>
          <input id="leader-reason" className={field} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Grandma is collecting; checked her ID" />
        </div>
        {error && <p role="alert" className="mt-4 text-xl font-medium text-[#7a4f0e]">{error}</p>}
        <div className="mt-8 flex gap-4">
          <button type="button" onClick={onClose} className="kids-focus min-h-[80px] px-6 text-xl font-medium text-[#1f6d73]">
            Cancel
          </button>
          <button type="submit" disabled={busy || !leader.trim() || !reason.trim() || !pin}
            className="kids-focus ml-auto min-h-[80px] rounded-2xl bg-[#1f6d73] px-10 text-[22px] font-semibold text-white disabled:bg-[#9fbfbc]">
            {busy ? 'Releasing…' : `Release ${child.first_name}`}
          </button>
        </div>
      </form>
    </div>
  )
}

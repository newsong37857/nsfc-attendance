'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiSend } from '@/lib/api'
import type { Person, Event } from '@/lib/supabase'
import type { ContactPrompt } from '@/lib/contact-prompt'
import ContactPromptSheet from '@/components/ContactPromptSheet'

export default function SelfCheckIn() {
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null)
  const [search, setSearch] = useState('')
  const [filtered, setFiltered] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set())
  const [checking, setChecking] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<{ name: string; already: boolean } | null>(null)
  const [contactAsk, setContactAsk] = useState<{
    personId: string
    firstName: string
    prompt: ContactPrompt
  } | null>(null)
  const closeContactAsk = useCallback(() => setContactAsk(null), [])

  useEffect(() => {
    loadData()
  }, [])

  // Names are looked up on the server as the person types (2+ letters), so the
  // directory never has to be downloaded to this device.
  useEffect(() => {
    const q = search.trim()
    if (q.length < 2) {
      setFiltered([])
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const { people } = await apiGet<{ people: Person[] }>(
          `/api/people?q=${encodeURIComponent(q)}`
        )
        if (!cancelled) setFiltered(people)
      } catch (err) {
        console.error('Search failed:', err)
      }
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [search])

  const loadData = async () => {
    try {
      // Today's event (in the church's time zone)
      const { events } = await apiGet<{ events: Event[] }>('/api/events?scope=today')
      const event = events[0] ?? null
      setCurrentEvent(event)

      if (event) {
        const { personIds } = await apiGet<{ personIds: string[] }>(
          `/api/attendance?eventId=${event.id}`
        )
        setCheckedIn(new Set(personIds))
      }
    } catch (err) {
      console.error('Failed to load check-in:', err)
    }
    setLoading(false)
  }

  const handleCheckIn = async (person: Person) => {
    if (!currentEvent || checking) return
    setChecking(person.id)
    const name = `${person.first_name} ${person.last_name}`

    if (checkedIn.has(person.id)) {
      setConfirmed({ name, already: true })
      setChecking(null)
      setTimeout(() => setConfirmed(null), 3000)
      return
    }

    try {
      const { alreadyCheckedIn, contactPrompt } = await apiSend<{
        alreadyCheckedIn: boolean
        contactPrompt: ContactPrompt | null
      }>('/api/attendance', 'POST', { eventId: currentEvent.id, personId: person.id, self: true })
      setCheckedIn((prev) => new Set(prev).add(person.id))
      setSearch('')
      if (contactPrompt && !alreadyCheckedIn) {
        // The prompt's own "Welcome" header stands in for the toast.
        setContactAsk({ personId: person.id, firstName: person.first_name, prompt: contactPrompt })
        setChecking(null)
        return
      }
      setConfirmed({ name, already: alreadyCheckedIn })
    } catch (err) {
      console.error('Check-in failed:', err)
    }
    setChecking(null)

    setTimeout(() => setConfirmed(null), 3000)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fffff0] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#3a9ca1] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#1f6d73] font-medium">Loading...</p>
        </div>
      </div>
    )
  }

  if (!currentEvent) {
    return (
      <div className="min-h-screen bg-[#fffff0] flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-[#10454f]/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#10454f]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[#10454f] mb-2">No Event Today</h1>
          <p className="text-gray-500">Check-in will be available when a service is scheduled.</p>
        </div>
      </div>
    )
  }

  const eventDate = new Date(currentEvent.event_date + 'T12:00:00')

  return (
    <div className="min-h-screen bg-[#fffff0] flex flex-col">
      {/* Header */}
      <header className="bg-[#10454f] text-white px-6 pt-14 pb-8 text-center rounded-b-3xl">
        <div className="w-14 h-14 rounded-full bg-[#3a9ca1] flex items-center justify-center text-white font-bold text-lg mx-auto mb-3">
          NS
        </div>
        <h1 className="text-xl font-bold">Welcome to New Song!</h1>
        <p className="text-[#3a9ca1] text-sm mt-1">
          {currentEvent.name} &middot;{' '}
          {eventDate.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </header>

      {/* Search */}
      <div className="px-6 -mt-6">
        <div className="bg-white rounded-2xl shadow-lg px-4 py-4">
          <p className="text-sm text-gray-500 mb-2 text-center">
            Type your name to check in
          </p>
          <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
            <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Your name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 text-[#10454f] text-lg placeholder-gray-400 bg-transparent focus:outline-none"
              autoFocus
              autoComplete="off"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-gray-400 p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 px-6 mt-4 pb-8">
        {search.length > 0 && search.length < 2 && (
          <p className="text-center text-gray-400 text-sm mt-8">Keep typing...</p>
        )}

        {search.length >= 2 && filtered.length === 0 && (
          <div className="text-center mt-8">
            <p className="text-gray-500 font-medium">No results found</p>
            <p className="text-gray-400 text-sm mt-1">Try a different spelling</p>
          </div>
        )}

        <div className="space-y-2">
          {filtered.map((person) => {
            const isChecked = checkedIn.has(person.id)
            const isChecking = checking === person.id
            return (
              <button
                key={person.id}
                onClick={() => handleCheckIn(person)}
                disabled={isChecking}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all active:scale-[0.98] ${
                  isChecked
                    ? 'bg-[#3a9ca1]/10 border-2 border-[#3a9ca1]/30'
                    : 'bg-white shadow-sm border-2 border-transparent'
                }`}
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    isChecked
                      ? 'bg-[#3a9ca1] text-white'
                      : 'bg-[#10454f]/10 text-[#10454f]'
                  }`}
                >
                  {isChecked ? (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : isChecking ? (
                    <div className="w-5 h-5 border-2 border-[#10454f] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    `${person.first_name[0]}${person.last_name[0]}`.toUpperCase()
                  )}
                </div>
                <div className="flex-1 text-left">
                  <p className={`text-lg font-semibold ${isChecked ? 'text-[#1f6d73]' : 'text-[#10454f]'}`}>
                    {person.first_name} {person.last_name}
                  </p>
                  {isChecked && (
                    <p className="text-xs text-[#3a9ca1]">Checked in</p>
                  )}
                </div>
                {!isChecked && (
                  <span className="text-sm font-medium text-[#3a9ca1] bg-[#3a9ca1]/10 px-4 py-2 rounded-full">
                    Check In
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {!search && (
          <div className="text-center mt-12">
            <svg className="w-16 h-16 mx-auto text-[#3a9ca1]/30 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-gray-400 text-sm">Search your name above to check in</p>
          </div>
        )}
      </div>

      {contactAsk && (
        <ContactPromptSheet
          key={contactAsk.personId}
          personId={contactAsk.personId}
          firstName={contactAsk.firstName}
          prompt={contactAsk.prompt}
          onClose={closeContactAsk}
        />
      )}

      {/* Confirmation toast */}
      {confirmed && (
        <div className="fixed bottom-6 left-4 right-4 z-50">
          <div className="bg-[#10454f] text-white px-6 py-4 rounded-2xl shadow-xl flex items-center gap-3 animate-[slideUp_0.3s_ease-out]">
            <svg className="w-6 h-6 text-[#3a9ca1] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="font-medium">
              {confirmed.already
                ? `${confirmed.name} is already checked in!`
                : `Welcome, ${confirmed.name}!`}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

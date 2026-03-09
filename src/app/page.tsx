'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import type { Person, Event, Attendance } from '@/lib/supabase'
import NewVisitorSheet from '@/components/NewVisitorSheet'

const QRScanner = dynamic(() => import('@/components/QRScanner'), { ssr: false })

type Filter = 'all' | 'not_checked' | 'checked' | 'visitors'
type Mode = 'roster' | 'qr'

export default function AttendancePage() {
  const [people, setPeople] = useState<Person[]>([])
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set())
  const [attendanceMap, setAttendanceMap] = useState<Map<string, string>>(new Map()) // person_id -> attendance_id
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [showVisitorSheet, setShowVisitorSheet] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showEventPicker, setShowEventPicker] = useState(false)
  const [allEvents, setAllEvents] = useState<Event[]>([])
  const [mode, setMode] = useState<Mode>('roster')

  // Load events and select today's
  useEffect(() => {
    loadEvents()
  }, [])

  // Load people when event is ready
  useEffect(() => {
    if (currentEvent) {
      loadPeople()
      loadAttendance()
    }
  }, [currentEvent])

  const loadEvents = async () => {
    // Use Eastern Time so "today" matches the church's timezone
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

    // Fetch events up to today (no future events), most recent first
    const { data: events } = await supabase
      .from('events')
      .select('*')
      .lte('event_date', today)
      .order('event_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(30)

    // Check if today's event already exists in results
    const todayEvent = events?.find((e) => e.event_date === today)

    if (todayEvent) {
      setAllEvents(events!)
      setCurrentEvent(todayEvent)
      return
    }

    // No event for today — create one (check DB first to avoid duplicates)
    const { data: existingToday } = await supabase
      .from('events')
      .select('*')
      .eq('event_date', today)
      .limit(1)
      .single()

    if (existingToday) {
      const allWithToday = [existingToday, ...(events || [])]
      setAllEvents(allWithToday)
      setCurrentEvent(existingToday)
      return
    }

    // Determine day of week in Eastern Time
    const [y, m, d] = today.split('-').map(Number)
    const dayOfWeek = new Date(y, m - 1, d).getDay()
    const eventName = dayOfWeek === 0 ? 'Sunday Service' : 'Midweek Service'
    const eventType = dayOfWeek === 0 ? 'sunday_service' : 'midweek'

    const { data: newEvent } = await supabase
      .from('events')
      .insert({
        name: eventName,
        event_type: eventType,
        event_date: today,
        start_time: dayOfWeek === 0 ? '10:00' : '19:00',
      })
      .select()
      .single()

    if (newEvent) {
      setCurrentEvent(newEvent)
      setAllEvents([newEvent, ...(events || [])])
    }
  }

  const switchEvent = (event: Event) => {
    setCurrentEvent(event)
    setShowEventPicker(false)
  }

  const loadPeople = async () => {
    const { data } = await supabase
      .from('people')
      .select('id, first_name, last_name, email, phone, membership_status, created_at')
      .order('last_name')
      .order('first_name')

    if (data) setPeople(data)
    setLoading(false)
  }

  const loadAttendance = async () => {
    if (!currentEvent) return
    const { data } = await supabase
      .from('attendance')
      .select('id, person_id')
      .eq('event_id', currentEvent.id)

    if (data) {
      const checked = new Set<string>()
      const aMap = new Map<string, string>()
      data.forEach((a) => {
        checked.add(a.person_id)
        aMap.set(a.person_id, a.id)
      })
      setCheckedIn(checked)
      setAttendanceMap(aMap)
    }
  }

  const toggleCheckIn = async (personId: string) => {
    if (!currentEvent) return

    if (checkedIn.has(personId)) {
      // Undo check-in
      const attendanceId = attendanceMap.get(personId)
      if (attendanceId) {
        await supabase.from('attendance').delete().eq('id', attendanceId)
      }
      setCheckedIn((prev) => {
        const next = new Set(prev)
        next.delete(personId)
        return next
      })
      setAttendanceMap((prev) => {
        const next = new Map(prev)
        next.delete(personId)
        return next
      })
    } else {
      // Check in
      const { data } = await supabase
        .from('attendance')
        .insert({ event_id: currentEvent.id, person_id: personId })
        .select('id')
        .single()

      setCheckedIn((prev) => new Set(prev).add(personId))
      if (data) {
        setAttendanceMap((prev) => new Map(prev).set(personId, data.id))
      }
    }
  }

  const handleNewVisitor = async (
    visitor: {
      first_name: string
      last_name: string
      phone?: string
      email?: string
      visitor_type: string
      referral_source?: string
    },
    checkIn: boolean
  ) => {
    const notes = [
      visitor.visitor_type !== 'first_time' ? `Type: ${visitor.visitor_type}` : 'First time visitor',
      visitor.referral_source ? `Referred by: ${visitor.referral_source}` : '',
    ]
      .filter(Boolean)
      .join('. ')

    const { data: newPerson } = await supabase
      .from('people')
      .insert({
        first_name: visitor.first_name,
        last_name: visitor.last_name,
        phone: visitor.phone || null,
        email: visitor.email || null,
        membership_status: 'visitor',
        notes: notes || null,
      })
      .select()
      .single()

    if (newPerson) {
      setPeople((prev) => [...prev, newPerson].sort((a, b) =>
        a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name)
      ))

      if (checkIn && currentEvent) {
        const { data: att } = await supabase
          .from('attendance')
          .insert({ event_id: currentEvent.id, person_id: newPerson.id })
          .select('id')
          .single()

        setCheckedIn((prev) => new Set(prev).add(newPerson.id))
        if (att) {
          setAttendanceMap((prev) => new Map(prev).set(newPerson.id, att.id))
        }
      }

      showToast(`${visitor.first_name} ${visitor.last_name} added${checkIn ? ' & checked in' : ''}!`)
    }
  }

  const showToast = (message: string) => {
    setToast(message)
    setTimeout(() => setToast(null), 3000)
  }

  const filteredPeople = useMemo(() => {
    let result = people

    // Search filter
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (p) =>
          p.first_name.toLowerCase().includes(q) ||
          p.last_name.toLowerCase().includes(q) ||
          `${p.first_name} ${p.last_name}`.toLowerCase().includes(q)
      )
    }

    // Tab filter
    switch (filter) {
      case 'not_checked':
        result = result.filter((p) => !checkedIn.has(p.id))
        break
      case 'checked':
        result = result.filter((p) => checkedIn.has(p.id))
        break
      case 'visitors':
        result = result.filter((p) => p.membership_status === 'visitor')
        break
    }

    return result
  }, [people, search, filter, checkedIn])

  const checkedInCount = checkedIn.size
  const memberCount = people.filter((p) => p.membership_status !== 'visitor').length
  const visitorCount = people.filter(
    (p) => p.membership_status === 'visitor' && checkedIn.has(p.id)
  ).length

  const getInitials = useCallback((p: Person) => {
    return `${p.first_name[0]}${p.last_name[0]}`.toUpperCase()
  }, [])

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

  return (
    <div className="min-h-screen bg-[#fffff0] flex flex-col">
      {/* Header */}
      <header className="bg-[#10454f] text-white px-4 pt-12 pb-5 rounded-b-3xl">
        <div className="flex items-center justify-between mb-4">
          <div className="relative">
            <h1 className="text-xl font-bold">Attendance</h1>
            <button
              onClick={() => setShowEventPicker(!showEventPicker)}
              className="flex items-center gap-1 text-[#3a9ca1] text-sm hover:text-white transition-colors"
            >
              <span>
                {currentEvent?.name || 'Service'} &middot;{' '}
                {currentEvent
                  ? new Date(currentEvent.event_date + 'T12:00:00').toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })
                  : new Date().toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
              </span>
              <svg className={`w-4 h-4 transition-transform ${showEventPicker ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Event Dropdown */}
            {showEventPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowEventPicker(false)} />
                <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-2xl shadow-xl z-50 overflow-hidden fade-in">
                  <div className="max-h-64 overflow-y-auto">
                    {allEvents.map((event) => {
                      const isSelected = currentEvent?.id === event.id
                      const eventDate = new Date(event.event_date + 'T12:00:00')
                      const today = new Date().toISOString().split('T')[0]
                      const isToday = event.event_date === today
                      return (
                        <button
                          key={event.id}
                          onClick={() => switchEvent(event)}
                          className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                            isSelected ? 'bg-[#3a9ca1]/10' : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? 'bg-[#3a9ca1]' : 'bg-transparent'}`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold truncate ${isSelected ? 'text-[#1f6d73]' : 'text-[#10454f]'}`}>
                              {event.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {eventDate.toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                year: eventDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
                              })}
                              {isToday && (
                                <span className="ml-1 text-[#3a9ca1] font-medium">Today</span>
                              )}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode(mode === 'roster' ? 'qr' : 'roster')}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                mode === 'qr' ? 'bg-[#3a9ca1] text-white' : 'bg-white/10'
              }`}
              title={mode === 'qr' ? 'Switch to roster' : 'Switch to QR scan'}
            >
              {mode === 'qr' ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
              )}
            </button>
            <button
              onClick={async () => {
                await fetch('/api/auth', { method: 'DELETE' })
                window.location.href = '/login'
              }}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
              title="Lock"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white/10 rounded-2xl p-3 text-center">
            <p className="text-2xl font-bold">{checkedInCount}</p>
            <p className="text-xs text-[#3a9ca1]">Checked In</p>
          </div>
          <div className="bg-white/10 rounded-2xl p-3 text-center">
            <p className="text-2xl font-bold">{memberCount}</p>
            <p className="text-xs text-[#3a9ca1]">Members</p>
          </div>
          <div className="bg-white/10 rounded-2xl p-3 text-center">
            <p className="text-2xl font-bold">{visitorCount}</p>
            <p className="text-xs text-[#3a9ca1]">Visitors</p>
          </div>
        </div>
      </header>

      {/* QR Scanner Mode */}
      {mode === 'qr' && currentEvent && (
        <div className="px-4 mt-4 pb-24">
          <QRScanner eventId={currentEvent.id} />
          <p className="text-center text-xs text-gray-400 mt-4">
            Tap the list icon above to switch back to roster mode
          </p>
        </div>
      )}

      {/* Search (roster mode only) */}
      {mode === 'roster' && <div className="px-4 -mt-5">
        <div className="bg-white rounded-2xl shadow-lg px-4 py-3 flex items-center gap-3">
          <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-[#10454f] placeholder-gray-400 bg-transparent focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-gray-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>}

      {/* Filter Tabs (roster mode only) */}
      {mode === 'roster' && <div className="flex gap-2 px-4 mt-4 overflow-x-auto">
        {([
          { key: 'all', label: 'All' },
          { key: 'not_checked', label: 'Not Checked In' },
          { key: 'checked', label: 'Checked In' },
          { key: 'visitors', label: 'Visitors' },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
              filter === tab.key
                ? 'bg-[#10454f] text-white'
                : 'bg-white text-gray-600 shadow-sm'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>}

      {/* People List */}
      {mode === 'roster' && <div className="flex-1 px-4 mt-4 pb-24 space-y-2">
        {filteredPeople.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="font-medium">No people found</p>
            <p className="text-sm mt-1">Try a different search or filter</p>
          </div>
        ) : (
          filteredPeople.map((person) => {
            const isChecked = checkedIn.has(person.id)
            const isVisitor = person.membership_status === 'visitor'
            return (
              <button
                key={person.id}
                onClick={() => toggleCheckIn(person.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all active:scale-[0.98] ${
                  isChecked
                    ? 'bg-[#3a9ca1]/10 border-2 border-[#3a9ca1]/30'
                    : 'bg-white shadow-sm border-2 border-transparent'
                }`}
              >
                {/* Avatar */}
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    isChecked
                      ? 'bg-[#3a9ca1] text-white'
                      : isVisitor
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-[#10454f]/10 text-[#10454f]'
                  }`}
                >
                  {isChecked ? (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    getInitials(person)
                  )}
                </div>

                {/* Name & Status */}
                <div className="flex-1 text-left min-w-0">
                  <p className={`font-semibold truncate ${isChecked ? 'text-[#1f6d73]' : 'text-[#10454f]'}`}>
                    {person.first_name} {person.last_name}
                  </p>
                  {isVisitor && (
                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                      Visitor
                    </span>
                  )}
                </div>

                {/* Check-in indicator */}
                <div
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                    isChecked
                      ? 'border-[#3a9ca1] bg-[#3a9ca1]'
                      : 'border-gray-300'
                  }`}
                >
                  {isChecked && (
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </button>
            )
          })
        )}
      </div>}

      {/* FAB - Add Visitor (roster mode only) */}
      {mode === 'roster' && <button
        onClick={() => setShowVisitorSheet(true)}
        className="fixed bottom-6 right-6 w-16 h-16 bg-[#3a9ca1] text-white rounded-full shadow-lg flex items-center justify-center active:scale-90 transition-transform z-40"
      >
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      </button>}

      {/* New Visitor Sheet */}
      <NewVisitorSheet
        open={showVisitorSheet}
        onClose={() => setShowVisitorSheet(false)}
        onSave={handleNewVisitor}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-4 right-4 z-50">
          <div className="bg-[#10454f] text-white px-6 py-4 rounded-2xl shadow-xl toast-in flex items-center gap-3">
            <svg className="w-6 h-6 text-[#3a9ca1] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="font-medium">{toast}</p>
          </div>
        </div>
      )}
    </div>
  )
}

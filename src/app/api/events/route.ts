import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, churchToday } from '@/lib/supabase-admin'

const EVENT_FIELDS = 'id, name, event_type, event_date, start_time, notes, created_at'

function shiftDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}

/**
 * GET /api/events
 *   ?scope=today  → just today's event (self check-in); never creates one
 *   (default)     → events from 4 weeks back to 2 weeks ahead, creating
 *                   today's service if it doesn't exist yet
 * Returns { events, currentEventId, warning? }
 */
export async function GET(req: NextRequest) {
  const supabase = getAdminClient()
  const today = churchToday()

  if (req.nextUrl.searchParams.get('scope') === 'today') {
    const { data, error } = await supabase
      .from('events')
      .select(EVENT_FIELDS)
      .eq('event_date', today)
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) return NextResponse.json({ error: 'Could not load events' }, { status: 500 })
    return NextResponse.json({ events: data ?? [], currentEventId: data?.[0]?.id ?? null })
  }

  const { data: events, error } = await supabase
    .from('events')
    .select(EVENT_FIELDS)
    .gte('event_date', shiftDate(today, -28))
    .lte('event_date', shiftDate(today, 14))
    .order('event_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Could not load events' }, { status: 500 })

  const list = events ?? []
  const todayEvent = list.find((e) => e.event_date === today)
  if (todayEvent) {
    return NextResponse.json({ events: list, currentEventId: todayEvent.id })
  }

  // No event today yet — create the regular service for this day.
  const [y, m, d] = today.split('-').map(Number)
  const isSunday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0
  const { data: created, error: insertError } = await supabase
    .from('events')
    .insert({
      name: isSunday ? 'Sunday Service' : 'Midweek Service',
      event_type: isSunday ? 'sunday_service' : 'midweek',
      event_date: today,
      start_time: isSunday ? '10:00' : '19:00',
    })
    .select(EVENT_FIELDS)
    .single()

  if (created) {
    return NextResponse.json({ events: [created, ...list], currentEventId: created.id })
  }

  console.error("Failed to auto-create today's event:", insertError)
  return NextResponse.json({
    events: list,
    currentEventId: list[0]?.id ?? null,
    warning: "Could not auto-create today's event. Showing previous event.",
  })
}

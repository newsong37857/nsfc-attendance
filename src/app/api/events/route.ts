import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, churchToday } from '@/lib/supabase-admin'
import { isSunday, orderForPicker, pickCurrentEvent, shiftDate } from '@/lib/events'

const EVENT_FIELDS = 'id, name, event_type, event_date, start_time, notes, created_at'

/**
 * GET /api/events
 *   ?scope=today  → just today's event (self check-in); never creates one
 *   (default)     → events from 4 weeks back to 2 weeks ahead, ordered today →
 *                   upcoming → past, with `currentEventId` = today's event, else
 *                   the next upcoming one. Only a Sunday with no service on the
 *                   books gets one auto-created; every regular service is already
 *                   scheduled from the CRM, so creating one on any other day only
 *                   produced junk "Midweek Service" rows.
 * Returns { events, currentEventId, today, warning? }
 */
export async function GET(req: NextRequest) {
  const supabase = getAdminClient()
  const today = churchToday()

  if (req.nextUrl.searchParams.get('scope') === 'today') {
    const { data, error } = await supabase
      .from('events')
      .select(EVENT_FIELDS)
      .eq('event_date', today)
      .order('start_time', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .limit(1)
    if (error) return NextResponse.json({ error: 'Could not load events' }, { status: 500 })
    return NextResponse.json({ events: data ?? [], currentEventId: data?.[0]?.id ?? null, today })
  }

  const { data, error } = await supabase
    .from('events')
    .select(EVENT_FIELDS)
    .gte('event_date', shiftDate(today, -28))
    .lte('event_date', shiftDate(today, 14))
  if (error) return NextResponse.json({ error: 'Could not load events' }, { status: 500 })

  let events = orderForPicker(data ?? [], today)
  let current = pickCurrentEvent(events, today)

  if (current?.event_date !== today && isSunday(today)) {
    // Sunday with nothing scheduled: create the regular service so the door can open.
    const { data: created, error: insertError } = await supabase
      .from('events')
      .insert({
        name: 'Sunday Service - AM',
        event_type: 'sunday_service',
        event_date: today,
        start_time: '10:00',
      })
      .select(EVENT_FIELDS)
      .single()
    if (created) {
      events = [created, ...events]
      current = created
    } else {
      console.error("Failed to auto-create today's Sunday service:", insertError)
      return NextResponse.json({
        events,
        currentEventId: current?.id ?? null,
        today,
        warning: "Could not auto-create today's service. Showing the nearest event.",
      })
    }
  }

  return NextResponse.json({ events, currentEventId: current?.id ?? null, today })
}

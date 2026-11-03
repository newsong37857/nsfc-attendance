import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { safeEqual } from '@/lib/session'
import { UUID, audit, clean, isTodaysEvent } from '@/lib/kids-server'
import { normalizeCode } from '@/lib/kids'

/** Slows down guessing at the leader PIN or a pickup code. */
const WRONG_ANSWER_DELAY_MS = 1200

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * POST /api/kids/checkout
 *
 * { action: 'release', eventId, code, checkinIds[] }
 *   Releases the children whose open check-in carries that code. Every id must
 *   match the code, or nothing is released.
 *
 * { action: 'match', eventId, code }
 *   → { matches: [{ checkinId, childId, first_name, roomId }] } for the room
 *   screen to confirm before releasing. Wrong codes answer slowly.
 *
 * { action: 'override', eventId, checkinId, leaderPin, leaderName, reason }
 *   Releases one child without a code. Needs KIDS_LEADER_PIN (known only to
 *   room leaders and staff); the leader's name and reason are logged.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const supabase = getAdminClient()
  const eventId = typeof body.eventId === 'string' ? body.eventId : ''
  if (!(await isTodaysEvent(supabase, eventId))) {
    return NextResponse.json({ error: "That isn't today's service" }, { status: 400 })
  }

  if (body.action === 'match' || body.action === 'release') {
    const code = typeof body.code === 'string' ? normalizeCode(body.code) : ''
    if (code.length !== 4) return NextResponse.json({ error: 'Enter the 4-character code' }, { status: 400 })

    const { data: open } = await supabase
      .from('kids_checkins')
      .select('id, child_id, room_id, people:kids_children!kids_checkins_child_id_fkey(people!kids_children_person_id_fkey(first_name))')
      .eq('event_id', eventId)
      .eq('pickup_code', code)
      .is('checked_out_at', null)
    type Row = { id: string; child_id: string; room_id: string | null; people: { people: { first_name: string } | null } | null }
    const rows = (open ?? []) as unknown as Row[]
    if (rows.length === 0) {
      await wait(WRONG_ANSWER_DELAY_MS)
      return NextResponse.json({ error: 'No child here has that code. Check the sticker and try again.' }, { status: 404 })
    }

    if (body.action === 'match') {
      return NextResponse.json({
        matches: rows.map((r) => ({
          checkinId: r.id,
          childId: r.child_id,
          first_name: r.people?.people?.first_name ?? 'Child',
          roomId: r.room_id,
        })),
      })
    }

    const ids = Array.isArray(body.checkinIds) ? body.checkinIds.filter((id): id is string => typeof id === 'string' && UUID.test(id)) : []
    const valid = new Set(rows.map((r) => r.id))
    if (ids.length === 0 || ids.some((id) => !valid.has(id))) {
      return NextResponse.json({ error: "Those children don't share that code" }, { status: 400 })
    }
    const { error } = await supabase
      .from('kids_checkins')
      .update({ checked_out_at: new Date().toISOString(), checked_out_method: 'code' })
      .in('id', ids)
      .is('checked_out_at', null)
    if (error) return NextResponse.json({ error: "Couldn't check out. Please try again." }, { status: 500 })

    const names = rows.filter((r) => ids.includes(r.id)).map((r) => r.people?.people?.first_name ?? 'Child')
    await audit(supabase, {
      action: 'UPDATE',
      table_name: 'kids_checkins',
      record_id: eventId,
      description: `Kids pickup: ${names.join(', ')} released with matching code`,
      metadata: { event_id: eventId, checkin_ids: ids, method: 'code' },
    })
    return NextResponse.json({ success: true, released: names })
  }

  if (body.action === 'override') {
    const expected = process.env.KIDS_LEADER_PIN
    const pin = typeof body.leaderPin === 'string' ? body.leaderPin.trim() : ''
    const leader = clean(body.leaderName, 80)
    const reason = clean(body.reason, 300)
    const checkinId = typeof body.checkinId === 'string' && UUID.test(body.checkinId) ? body.checkinId : null
    if (!checkinId || !leader || !reason) {
      return NextResponse.json({ error: 'Enter your name and the reason' }, { status: 400 })
    }
    if (!expected) {
      console.error('[kids] KIDS_LEADER_PIN is not set; overrides are disabled')
      return NextResponse.json({ error: 'Leader overrides are not set up. Ask a staff member.' }, { status: 503 })
    }
    if (!safeEqual(pin, expected)) {
      await wait(WRONG_ANSWER_DELAY_MS)
      return NextResponse.json({ error: "That leader PIN isn't right" }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('kids_checkins')
      .update({
        checked_out_at: new Date().toISOString(),
        checked_out_method: 'override',
        override_leader: leader,
        override_reason: reason,
      })
      .eq('id', checkinId)
      .eq('event_id', eventId)
      .is('checked_out_at', null)
      .select('child_id')
      .maybeSingle()
    if (error) return NextResponse.json({ error: "Couldn't check out. Please try again." }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Already checked out' }, { status: 409 })

    const { data: child } = await supabase.from('people').select('first_name, last_name').eq('id', data.child_id).single()
    await audit(supabase, {
      action: 'UPDATE',
      table_name: 'kids_checkins',
      record_id: checkinId,
      description: `Kids pickup override: ${child?.first_name ?? 'Child'} ${child?.last_name ?? ''} released without a code by ${leader}`,
      metadata: { event_id: eventId, override: true, leader, reason },
    })
    return NextResponse.json({ success: true, released: [child?.first_name ?? 'Child'] })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

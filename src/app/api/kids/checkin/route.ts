import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { checkInChildren } from '@/lib/kids-server'

/**
 * POST /api/kids/checkin { eventId, guardianId, childIds[], alsoGuardian? }
 * → { code, children: [{ id, first_name, room }], alreadyIn: string[], canText }
 * One pickup code for the children checked in together. The parent sees it
 * once, on the screen that answers this request.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const result = await checkInChildren(getAdminClient(), {
    eventId: typeof body.eventId === 'string' ? body.eventId : '',
    guardianId: typeof body.guardianId === 'string' ? body.guardianId : '',
    childIds: Array.isArray(body.childIds) ? body.childIds.filter((id): id is string => typeof id === 'string') : [],
    alsoGuardian: body.alsoGuardian !== false,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  const { code, children, alreadyIn, canText } = result
  return NextResponse.json({ code, children, alreadyIn, canText })
}

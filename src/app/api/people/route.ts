import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'

// Only what the check-in screens display. No contact details, addresses or notes.
const PERSON_FIELDS = 'id, first_name, last_name, membership_status'

/**
 * GET /api/people            → active roster for the staff check-in screen
 * GET /api/people?q=jo       → up to 10 name matches (self check-in search)
 */
export async function GET(req: NextRequest) {
  const supabase = getAdminClient()
  const q = req.nextUrl.searchParams.get('q')?.trim()

  if (q !== undefined) {
    if (q.length < 2) return NextResponse.json({ people: [] })
    // Strip characters that have meaning in a PostgREST filter / LIKE pattern.
    const term = q.replace(/[%_,.()*\\]/g, ' ').trim()
    if (!term) return NextResponse.json({ people: [] })

    const parts = term.split(/\s+/)
    let query = supabase.from('people').select(PERSON_FIELDS).is('deleted_at', null)
    if (parts.length >= 2) {
      // "Jordan Pri" → first name starts with Jordan, last name with Pri
      query = query
        .ilike('first_name', `${parts[0]}%`)
        .ilike('last_name', `${parts.slice(1).join(' ')}%`)
    } else {
      query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`)
    }
    const { data, error } = await query.order('last_name').order('first_name').limit(10)
    if (error) return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    return NextResponse.json({ people: data ?? [] })
  }

  const { data, error } = await supabase
    .from('people')
    .select(PERSON_FIELDS)
    .is('deleted_at', null)
    .neq('membership_status', 'inactive')
    .order('last_name')
    .order('first_name')
  if (error) return NextResponse.json({ error: 'Could not load people' }, { status: 500 })
  return NextResponse.json({ people: data ?? [] })
}

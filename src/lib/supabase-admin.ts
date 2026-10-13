// Server-only Supabase client using the service-role key. Import this only from
// route handlers under src/app/api — never from a 'use client' component. The
// browser no longer talks to the database directly; every request goes through
// an API route that the PIN-session middleware protects.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function getAdminClient(): SupabaseClient {
  if (client) return client
  // Strip trailing /rest/v1/? — supabase-js appends it itself.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  }
  client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}

/** Today's date (YYYY-MM-DD) in the church's time zone. */
export function churchToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

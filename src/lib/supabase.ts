// Shared data types. The browser no longer creates a Supabase client — all
// database access goes through the PIN-protected API routes in src/app/api,
// which use the server-only client in src/lib/supabase-admin.ts.

/** What the check-in screens need to know about a person — nothing more. */
export type Person = {
  id: string
  first_name: string
  last_name: string
  membership_status: string
}

export type Event = {
  id: string
  name: string
  event_type: string | null
  event_date: string
  start_time: string | null
  notes: string | null
  created_at: string
}

export type Attendance = {
  id: string
  event_id: string
  person_id: string
  checked_in_at: string
}

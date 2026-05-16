import { createClient } from '@supabase/supabase-js'

// Strip trailing /rest/v1/? — supabase-js appends it itself, so a value like
// https://xxx.supabase.co/rest/v1 would otherwise produce /rest/v1/rest/v1/...
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/rest\/v1\/?$/, '')
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Person = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  membership_status: string
  created_at: string
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

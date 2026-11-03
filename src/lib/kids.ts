// Kids check-in rules. Pure: no database, no React. A copy of the CRM's
// src/lib/kids.ts (nsfc-crm), which has the tests — change both together.

/** Private storage bucket for children's photos; read through signed URLs only. */
export const KIDS_PHOTO_BUCKET = 'kids-photos'

export interface KidsRoom {
  id: string
  name: string
  min_age_months: number
  max_age_months: number
  sort_order: number
  active: boolean
}

/**
 * Pickup code alphabet: no 0/O, 1/I/L, so a code read off a sticker in a
 * hurry can't be misread.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 4

/** Whole months between a YYYY-MM-DD birthdate and a YYYY-MM-DD day. */
export function ageInMonths(dateOfBirth: string, today: string): number {
  const [by, bm, bd] = dateOfBirth.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  let months = (ty - by) * 12 + (tm - bm)
  if (td < bd) months -= 1
  return Math.max(0, months)
}

/** '8 months', '2 years', '5 years' — how volunteers say it. */
export function formatAge(dateOfBirth: string | null, today: string): string | null {
  if (!dateOfBirth) return null
  const months = ageInMonths(dateOfBirth, today)
  if (months < 24) return `${months} ${months === 1 ? 'month' : 'months'}`
  const years = Math.floor(months / 12)
  return `${years} years`
}

/**
 * The room a child belongs in: the one set on their record, else the first
 * active room whose age range fits their birthdate. Null when neither applies
 * (no birthdate and no room set, or older than every room).
 */
export function roomForChild(
  rooms: KidsRoom[],
  child: { room_id: string | null; date_of_birth: string | null },
  today: string,
): KidsRoom | null {
  const active = rooms.filter((r) => r.active).sort((a, b) => a.sort_order - b.sort_order)
  if (child.room_id) {
    const set = rooms.find((r) => r.id === child.room_id)
    if (set) return set
  }
  if (!child.date_of_birth) return null
  const months = ageInMonths(child.date_of_birth, today)
  return active.find((r) => months >= r.min_age_months && months <= r.max_age_months) ?? null
}

/** A new pickup code not in `taken` (the event's codes still open). */
export function generatePickupCode(taken: Set<string>, random: () => number = Math.random): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = ''
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]
    }
    if (!taken.has(code)) return code
  }
  throw new Error('Could not find a free pickup code')
}

/** What a volunteer typed, made comparable with a stored code. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Last four digits of a phone number, or null when it has fewer. */
export function phoneLast4(phone: string | null): string | null {
  const digits = (phone ?? '').replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : null
}

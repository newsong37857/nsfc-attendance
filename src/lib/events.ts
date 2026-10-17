// Pure helpers for the kiosk's event list. Server-side, but no I/O.

type EventLike = { id: string; event_date: string; start_time: string | null; created_at: string }

/** isoDate ± days, as YYYY-MM-DD (no time-zone drift). */
export function shiftDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function isSunday(isoDate: string): boolean {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0
}

/**
 * Order for the picker: today's event(s) first, then upcoming soonest-first,
 * then past most-recent-first — so tomorrow's service is always near the top
 * instead of buried under everything two weeks out.
 */
export function orderForPicker<T extends EventLike>(events: T[], today: string): T[] {
  const time = (e: T) => e.start_time ?? ''
  const upcoming = events
    .filter((e) => e.event_date >= today)
    .sort(
      (a, b) =>
        a.event_date.localeCompare(b.event_date) ||
        time(a).localeCompare(time(b)) ||
        a.created_at.localeCompare(b.created_at)
    )
  const past = events
    .filter((e) => e.event_date < today)
    .sort(
      (a, b) =>
        b.event_date.localeCompare(a.event_date) ||
        time(b).localeCompare(time(a)) ||
        b.created_at.localeCompare(a.created_at)
    )
  return [...upcoming, ...past]
}

/**
 * Which event the kiosk should open on: today's if there is one, else the
 * next upcoming one (tomorrow's service on a Saturday), else the most recent.
 * Expects the list in picker order.
 */
export function pickCurrentEvent<T extends EventLike>(ordered: T[], today: string): T | null {
  return (
    ordered.find((e) => e.event_date === today) ??
    ordered.find((e) => e.event_date > today) ??
    ordered[0] ??
    null
  )
}

import { APP_TIME_ZONE } from "@/lib/time";

const dateAndTime = new Intl.DateTimeFormat("zh-TW", {
  timeZone: APP_TIME_ZONE,
  year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  hour: "2-digit", minute: "2-digit", hour12: false,
});

const timeOnly = new Intl.DateTimeFormat("zh-TW", {
  timeZone: APP_TIME_ZONE,
  hour: "2-digit", minute: "2-digit", hour12: false,
});

const dayKey = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric", month: "2-digit", day: "2-digit",
});

/** The Taipei calendar day an instant falls on, as YYYY-MM-DD. */
export function taipeiDay(value: string | Date): string {
  return dayKey.format(new Date(value));
}

export function isSameTaipeiDay(startsAt: string, endsAt: string): boolean {
  return taipeiDay(startsAt) === taipeiDay(endsAt);
}

/**
 * "2026/09/17（四）18:30－20:30" for an ordinary evening, and the full date on
 * both sides only when the event really does cross midnight.
 *
 * Repeating the date for an event that ends the same evening made every meeting
 * look like it ran overnight, and buried the one case where the second date is
 * the thing a member needs to see.
 */
export function formatEventTimeRange(startsAt: string, endsAt: string): string {
  const start = dateAndTime.format(new Date(startsAt));
  return isSameTaipeiDay(startsAt, endsAt)
    ? `${start}－${timeOnly.format(new Date(endsAt))}`
    : `${start}－${dateAndTime.format(new Date(endsAt))}`;
}

/** The time half alone, for a layout that already shows the date beside it. */
export function formatEventClockRange(startsAt: string, endsAt: string): string {
  const range = `${timeOnly.format(new Date(startsAt))}－${timeOnly.format(new Date(endsAt))}`;
  // A cross-midnight event needs the second date or the range reads backwards
  // ("18:30－02:00"), which is the one case a bare clock cannot express.
  return isSameTaipeiDay(startsAt, endsAt)
    ? range
    : `${timeOnly.format(new Date(startsAt))}－${dateAndTime.format(new Date(endsAt))}`;
}

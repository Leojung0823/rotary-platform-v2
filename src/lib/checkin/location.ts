import type { LocationCheckinEvent } from "@/components/events/location-checkin-panel";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const maximumEvents = 50;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEvent(value: unknown): LocationCheckinEvent | null {
  if (!isRecord(value)
    || typeof value.club_id !== "string" || !uuidPattern.test(value.club_id)
    || typeof value.event_id !== "string" || !uuidPattern.test(value.event_id)
    || typeof value.club_name !== "string" || value.club_name.length === 0 || value.club_name.length > 300
    || typeof value.title !== "string" || value.title.length === 0 || value.title.length > 160
    || typeof value.starts_at !== "string" || Number.isNaN(Date.parse(value.starts_at))
    || typeof value.already_checked_in !== "boolean") return null;

  return {
    club_id: value.club_id,
    club_name: value.club_name,
    event_id: value.event_id,
    title: value.title,
    starts_at: value.starts_at,
    already_checked_in: value.already_checked_in,
  };
}

// A malformed projection must not break the check-in screen: the QR path is the
// other half of this page and has to stay usable.
export function parseLocationCheckinEvents(value: unknown): readonly LocationCheckinEvent[] {
  if (!isRecord(value) || !Array.isArray(value.events)) return [];
  const events = value.events.slice(0, maximumEvents).map(parseEvent);
  return events.filter((event): event is LocationCheckinEvent => event !== null);
}

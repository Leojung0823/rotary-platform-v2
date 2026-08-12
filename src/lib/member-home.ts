export const memberHomeRegistrationStates = [
  "not_registered",
  "pending",
  "registered",
  "declined",
  "registration_closed",
] as const;
export type MemberHomeRegistrationState = (typeof memberHomeRegistrationStates)[number];

export const memberHomeCheckinStates = [
  "not_available",
  "not_open",
  "available",
  "checked_in",
  "closed",
] as const;
export type MemberHomeCheckinState = (typeof memberHomeCheckinStates)[number];

export type MemberHomeEvent = Readonly<{
  eventType: string;
  title: string;
  location: string;
  startsAt: string;
  endsAt: string;
  registrationState: MemberHomeRegistrationState;
  checkinState: MemberHomeCheckinState;
}>;

export type MemberHomeProjection = Readonly<{
  club: Readonly<{ clubCode: string; clubName: string }>;
  primaryEvent: MemberHomeEvent | null;
  nextEvent: MemberHomeEvent | null;
}>;

const maximumEventTextLength = 300;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDateTime(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  return actual.length === allowed.length && actual.every((key, index) => key === allowed[index]);
}

function parseEvent(value: unknown): MemberHomeEvent | null {
  if (!isRecord(value)
    || !hasExactKeys(value, [
      "event_type", "title", "location", "starts_at", "ends_at", "registration_state", "checkin_state",
    ])
    || typeof value.event_type !== "string"
    || typeof value.title !== "string"
    || typeof value.location !== "string"
    || value.event_type.length === 0
    || value.event_type.length > 64
    || value.title.length === 0
    || value.title.length > 160
    || value.location.length > maximumEventTextLength
    || !isIsoDateTime(value.starts_at)
    || !isIsoDateTime(value.ends_at)
    || !includes(memberHomeRegistrationStates, value.registration_state)
    || !includes(memberHomeCheckinStates, value.checkin_state)) return null;

  return {
    eventType: value.event_type,
    title: value.title,
    location: value.location,
    startsAt: value.starts_at,
    endsAt: value.ends_at,
    registrationState: value.registration_state,
    checkinState: value.checkin_state,
  };
}

export function parseMemberHomeProjection(value: unknown): MemberHomeProjection | null {
  if (!isRecord(value) || !hasExactKeys(value, ["club", "primary_event", "next_event"])
    || !isRecord(value.club)
    || !hasExactKeys(value.club, ["club_code", "club_name"])
    || typeof value.club.club_code !== "string"
    || typeof value.club.club_name !== "string"
    || value.club.club_code.length === 0
    || value.club.club_code.length > 64
    || value.club.club_name.length === 0
    || value.club.club_name.length > maximumEventTextLength) return null;

  const primaryEvent = value.primary_event === null ? null : parseEvent(value.primary_event);
  const nextEvent = value.next_event === null ? null : parseEvent(value.next_event);
  if ((value.primary_event !== null && primaryEvent === null)
    || (value.next_event !== null && nextEvent === null)) return null;

  return {
    club: { clubCode: value.club.club_code, clubName: value.club.club_name },
    primaryEvent,
    nextEvent,
  };
}

export function memberHomePrimaryAction(event: MemberHomeEvent): Readonly<{ href: string; label: string }> {
  if (event.checkinState === "available") return { href: "/events/checkin", label: "前往簽到" };
  if (event.registrationState === "not_registered") return { href: "/events", label: "前往報名" };
  if (event.registrationState === "pending") return { href: "/events", label: "確認報名" };
  return { href: "/events", label: "查看活動" };
}

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
  coverImagePath: string | null;
  title: string;
  location: string;
  startsAt: string;
  endsAt: string;
  registrationState: MemberHomeRegistrationState;
  /**
   * Whether registration is still open, which registrationState stops saying
   * once the member has answered. Without it "declined" cannot be told apart
   * from "declined, and too late to change".
   */
  registrationOpen: boolean;
  checkinState: MemberHomeCheckinState;
}>;

export type MemberHomeRecentEvent = Readonly<{
  title: string;
  location: string;
  startsAt: string;
  attended: boolean;
}>;

export type MemberHomeNotification = Readonly<{
  title: string;
  bodyPreview: string;
  actionPath: string | null;
  publishedAt: string;
  unread: boolean;
}>;

export type MemberHomeNotifications = Readonly<{
  unreadCount: number;
  items: readonly MemberHomeNotification[];
}>;

/** An event still to come, for the list beside the hero. */
export type MemberHomeUpcomingEvent = Readonly<{
  eventId: string;
  title: string;
  startsAt: string;
  registrationState: "registered" | "open" | "closed";
}>;

/** An event this member has been asked about and has not answered. */
export const pendingTaskKinds = [
  "event_response",
  "dues_outstanding",
  "birthday_wish",
  "unread_messages",
  "profile_incomplete",
] as const;
export type PendingTaskKind = (typeof pendingTaskKinds)[number];

/**
 * Something the member owes the club, of whatever sort.
 *
 * `deadline` and `hoursRemaining` are null together and only for the kinds that
 * genuinely have no due date -- unpaid dues carry no per-receivable due date in
 * this schema, and nothing goes wrong if a profile is never completed. A
 * reminder that cannot be late must not be able to say 「即將截止」.
 */
export type MemberHomePendingTask = Readonly<{
  kind: PendingTaskKind;
  title: string;
  detail: string;
  actionPath: string;
  deadline: string | null;
  hoursRemaining: number | null;
  /** How many, for the kinds that count rather than name one thing. */
  count: number | null;
}>;

export type MemberHomeProjection = Readonly<{
  club: Readonly<{ clubCode: string; clubName: string }>;
  primaryEvent: MemberHomeEvent | null;
  nextEvent: MemberHomeEvent | null;
  recentEvents: readonly MemberHomeRecentEvent[];
  upcomingEvents: readonly MemberHomeUpcomingEvent[];
  pendingTasks: readonly MemberHomePendingTask[];
  notifications: MemberHomeNotifications;
}>;

const maximumEventTextLength = 300;

// The same shape the message centre accepts: a relative in-app path, never a
// URL. The column constraint already rejects the rest, and this is the second
// gate before the value reaches an href.
const safeActionPathPattern = /^\/[A-Za-z0-9][-A-Za-z0-9/?=&._%]{0,498}$/u;

function isSafeActionPath(value: unknown): value is string {
  return typeof value === "string"
    && safeActionPathPattern.test(value)
    && !value.startsWith("//");
}

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
      "event_type", "title", "location", "cover_image_path",
      "starts_at", "ends_at", "registration_state", "registration_open", "checkin_state",
    ])
    || typeof value.event_type !== "string"
    || typeof value.title !== "string"
    || typeof value.location !== "string"
    || value.event_type.length === 0
    || value.event_type.length > 64
    || value.title.length === 0
    || value.title.length > 160
    || value.location.length > maximumEventTextLength
    // A storage path, never a URL: the page mints a signed URL from it. Anything
    // that is not a plain relative path is dropped rather than rendered.
    || !(value.cover_image_path === null
      || (typeof value.cover_image_path === "string"
        && value.cover_image_path.length > 0
        && value.cover_image_path.length <= 512
        && !value.cover_image_path.includes("..")
        && !/^[a-z][a-z0-9+.-]*:/iu.test(value.cover_image_path)))
    || !isIsoDateTime(value.starts_at)
    || !isIsoDateTime(value.ends_at)
    || !includes(memberHomeRegistrationStates, value.registration_state)
    || typeof value.registration_open !== "boolean"
    || !includes(memberHomeCheckinStates, value.checkin_state)) return null;

  return {
    eventType: value.event_type,
    title: value.title,
    location: value.location,
    coverImagePath: (value.cover_image_path as string | null) ?? null,
    startsAt: value.starts_at,
    endsAt: value.ends_at,
    registrationState: value.registration_state,
    registrationOpen: value.registration_open,
    checkinState: value.checkin_state,
  };
}

function parseRecentEvent(value: unknown): MemberHomeRecentEvent | null {
  if (!isRecord(value)
    || !hasExactKeys(value, ["title", "location", "starts_at", "attended"])
    || typeof value.title !== "string"
    || typeof value.location !== "string"
    || value.title.length === 0
    || value.title.length > 160
    || value.location.length > maximumEventTextLength
    || !isIsoDateTime(value.starts_at)
    || typeof value.attended !== "boolean") return null;

  return {
    title: value.title,
    location: value.location,
    startsAt: value.starts_at,
    attended: value.attended,
  };
}

const maximumRecentEvents = 3;
const maximumNotifications = 3;

function parseRecentEvents(value: unknown): readonly MemberHomeRecentEvent[] | null {
  if (!Array.isArray(value) || value.length > maximumRecentEvents) return null;
  const parsed = value.map(parseRecentEvent);
  return parsed.some((event) => event === null) ? null : (parsed as MemberHomeRecentEvent[]);
}

function parseNotification(value: unknown): MemberHomeNotification | null {
  if (!isRecord(value)
    || !hasExactKeys(value, ["title", "body_preview", "action_path", "published_at", "is_unread"])
    || typeof value.title !== "string"
    || value.title.length === 0
    || value.title.length > 120
    || typeof value.body_preview !== "string"
    || value.body_preview.length === 0
    || value.body_preview.length > 240
    || (value.action_path !== null && !isSafeActionPath(value.action_path))
    || !isIsoDateTime(value.published_at)
    || typeof value.is_unread !== "boolean") return null;

  return {
    title: value.title,
    bodyPreview: value.body_preview,
    actionPath: value.action_path as string | null,
    publishedAt: value.published_at,
    unread: value.is_unread,
  };
}

const maximumUpcomingEvents = 4;
const upcomingRegistrationStates = ["registered", "open", "closed"] as const;

function parseUpcomingEvent(value: unknown): MemberHomeUpcomingEvent | null {
  if (!isRecord(value)
    || !hasExactKeys(value, ["event_id", "title", "starts_at", "registration_state"])
    || typeof value.event_id !== "string"
    || value.event_id.length === 0
    || typeof value.title !== "string"
    || value.title.length === 0
    || value.title.length > maximumEventTextLength
    || typeof value.starts_at !== "string"
    || value.starts_at.length === 0
    || typeof value.registration_state !== "string"
    || !(upcomingRegistrationStates as readonly string[]).includes(value.registration_state)) return null;

  return {
    eventId: value.event_id,
    title: value.title,
    startsAt: value.starts_at,
    registrationState: value.registration_state as MemberHomeUpcomingEvent["registrationState"],
  };
}

function parseUpcomingEvents(value: unknown): readonly MemberHomeUpcomingEvent[] | null {
  if (!Array.isArray(value) || value.length > maximumUpcomingEvents) return null;
  const events = value.map(parseUpcomingEvent);
  if (events.some((event) => event === null)) return null;
  return events as MemberHomeUpcomingEvent[];
}

const maximumPendingTasks = 5;

function parsePendingTask(value: unknown): MemberHomePendingTask | null {
  if (!isRecord(value)
    || !hasExactKeys(value, ["kind", "title", "detail", "action_path", "deadline", "hours_remaining", "count"])
    || !includes(pendingTaskKinds, value.kind)
    || typeof value.title !== "string"
    || value.title.length === 0
    || value.title.length > maximumEventTextLength
    || typeof value.detail !== "string"
    || value.detail.length > maximumEventTextLength
    // A relative path this app serves, never a URL: the row decides where a
    // tap goes, and an absolute one would let the projection send a member off
    // the platform.
    || typeof value.action_path !== "string"
    || !value.action_path.startsWith("/")
    || value.action_path.startsWith("//")
    || value.action_path.length > 200) return null;

  // Deadline and countdown arrive together or not at all. One without the
  // other means the projection and this parser disagree about what a row is.
  const hasDeadline = value.deadline !== null;
  if (hasDeadline) {
    if (!isIsoDateTime(value.deadline)) return null;
    if (typeof value.hours_remaining !== "number"
      || !Number.isSafeInteger(value.hours_remaining)
      // Every deadline-bearing row is filtered to one still ahead, so a
      // negative here means the two sides disagree about what it contains.
      || value.hours_remaining < 0) return null;
  } else if (value.hours_remaining !== null) {
    return null;
  }

  if (!(value.count === null
    || (typeof value.count === "number" && Number.isSafeInteger(value.count) && value.count > 0))) {
    return null;
  }

  return {
    kind: value.kind,
    title: value.title,
    detail: value.detail,
    actionPath: value.action_path,
    deadline: (value.deadline as string | null) ?? null,
    hoursRemaining: (value.hours_remaining as number | null) ?? null,
    count: (value.count as number | null) ?? null,
  };
}

function parsePendingTasks(value: unknown): readonly MemberHomePendingTask[] | null {
  if (!Array.isArray(value) || value.length > maximumPendingTasks) return null;
  const tasks = value.map(parsePendingTask);
  if (tasks.some((task) => task === null)) return null;
  return tasks as MemberHomePendingTask[];
}

function parseNotifications(value: unknown): MemberHomeNotifications | null {
  if (!isRecord(value)
    || !hasExactKeys(value, ["unread_count", "items"])
    || typeof value.unread_count !== "number"
    || !Number.isSafeInteger(value.unread_count)
    || value.unread_count < 0
    || !Array.isArray(value.items)
    || value.items.length > maximumNotifications) return null;

  const items = value.items.map(parseNotification);
  if (items.some((item) => item === null)) return null;
  return { unreadCount: value.unread_count, items: items as MemberHomeNotification[] };
}

export function parseMemberHomeProjection(value: unknown): MemberHomeProjection | null {
  if (!isRecord(value) || !hasExactKeys(value, ["club", "primary_event", "next_event", "recent_events", "upcoming_events", "pending_tasks", "notifications"])
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

  const recentEvents = parseRecentEvents(value.recent_events);
  if (recentEvents === null) return null;
  const upcomingEvents = parseUpcomingEvents(value.upcoming_events);
  if (upcomingEvents === null) return null;

  const pendingTasks = parsePendingTasks(value.pending_tasks);
  if (pendingTasks === null) return null;

  const notifications = parseNotifications(value.notifications);
  if (notifications === null) return null;

  return {
    club: { clubCode: value.club.club_code, clubName: value.club.club_name },
    primaryEvent,
    nextEvent,
    recentEvents,
    upcomingEvents,
    pendingTasks,
    notifications,
  };
}

export function memberHomePrimaryAction(event: MemberHomeEvent): Readonly<{ href: string; label: string }> {
  if (event.checkinState === "available") return { href: "/events/checkin", label: "前往簽到" };
  if (event.registrationState === "not_registered") return { href: "/events", label: "前往報名" };
  if (event.registrationState === "pending") return { href: "/events", label: "確認報名" };
  // Declining is an answer, not a door closing behind you -- while the deadline
  // has not passed, the card offers the way back. It is gated on
  // registrationOpen because offering it after the deadline would be a lie.
  if (event.registrationState === "declined" && event.registrationOpen) {
    return { href: "/events", label: "改為報名" };
  }
  return { href: "/events", label: "查看活動" };
}

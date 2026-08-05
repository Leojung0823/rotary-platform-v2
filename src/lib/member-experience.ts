export type MemberClub = {
  club_id: string;
  club_code: string;
  club_name: string;
  membership_id: string;
  membership_number: string | null;
  role_key: string;
  can_manage: boolean;
};

export type MemberEventListItem = {
  id: string;
  event_type: string;
  title: string;
  location: string;
  starts_at: string;
  ends_at: string;
  registration_deadline: string;
  status: "published" | "cancelled" | "completed";
  my_response: "pending" | "attending" | "declined" | null;
  my_guest_count: number;
  registration_open: boolean;
  checked_in: boolean;
  checked_in_at: string | null;
  ended: boolean;
  checkin_available: boolean;
};

export const roleLabels: Record<string, string> = {
  president: "社長",
  secretary: "秘書",
  finance: "財務",
  member: "社員",
};

export const responseLabels: Record<string, string> = {
  pending: "稍後決定",
  attending: "已報名",
  declined: "不參加",
};

export function isMemberClub(value: unknown): value is MemberClub {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const club = value as Record<string, unknown>;
  return typeof club.club_id === "string"
    && typeof club.club_code === "string"
    && typeof club.club_name === "string"
    && typeof club.membership_id === "string"
    && (typeof club.membership_number === "string" || club.membership_number === null)
    && typeof club.role_key === "string"
    && typeof club.can_manage === "boolean";
}

export function parseMemberClubs(value: unknown): MemberClub[] | null {
  return Array.isArray(value) && value.every(isMemberClub) ? value : null;
}

function isMemberEvent(value: unknown): value is MemberEventListItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return typeof event.id === "string"
    && typeof event.event_type === "string"
    && typeof event.title === "string"
    && typeof event.location === "string"
    && typeof event.starts_at === "string"
    && typeof event.ends_at === "string"
    && typeof event.registration_deadline === "string"
    && (event.status === "published" || event.status === "cancelled" || event.status === "completed")
    && (event.my_response === null || event.my_response === "pending" || event.my_response === "attending" || event.my_response === "declined")
    && typeof event.my_guest_count === "number"
    && typeof event.registration_open === "boolean"
    && typeof event.checked_in === "boolean"
    && (typeof event.checked_in_at === "string" || event.checked_in_at === null)
    && typeof event.ended === "boolean"
    && typeof event.checkin_available === "boolean";
}

export function parseMemberEvents(value: unknown): MemberEventListItem[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const events = (value as Record<string, unknown>).events;
  return Array.isArray(events) && events.every(isMemberEvent) ? events : null;
}

export function formatDateTime(value: string, includeYear = false) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    ...(includeYear ? { year: "numeric" as const } : {}),
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export type EventClub = {
  club_id: string;
  club_code: string;
  club_name: string;
  can_manage: boolean;
  can_register: boolean;
};

export type ClubEvent = {
  id: string;
  event_type: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string;
  registration_deadline: string;
  capacity: number | null;
  counts_for_attendance: boolean;
  status: "draft" | "published" | "cancelled" | "completed";
  version: number;
  attending_members: number;
  attending_spots: number;
  remaining_spots: number | null;
  my_response: "pending" | "attending" | "declined" | null;
  my_guest_count: number;
  my_note: string;
  can_manage: boolean;
  cover_image_path: string | null;
  registration_open: boolean;
};

export const eventTypeLabels: Record<string, string> = {
  regular_meeting: "例會",
  board_meeting: "理監事會",
  service: "服務活動",
  joint_meeting: "聯合例會",
  fireside: "爐邊會",
  other: "其他",
};

export const statusLabels: Record<ClubEvent["status"], string> = {
  draft: "草稿",
  published: "已發布",
  cancelled: "已取消",
  completed: "已結束",
};

export const responseLabels: Record<Exclude<ClubEvent["my_response"], null>, string> = {
  pending: "待確認",
  attending: "參加",
  declined: "不參加",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isEventClub(value: unknown): value is EventClub {
  if (!isRecord(value)) return false;
  return typeof value.club_id === "string"
    && typeof value.club_code === "string"
    && typeof value.club_name === "string"
    && typeof value.can_manage === "boolean"
    && typeof value.can_register === "boolean";
}

export function isClubEvent(value: unknown): value is ClubEvent {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.event_type === "string"
    && typeof value.title === "string"
    && typeof value.description === "string"
    && typeof value.location === "string"
    && typeof value.starts_at === "string"
    && typeof value.ends_at === "string"
    && typeof value.registration_deadline === "string"
    && (typeof value.capacity === "number" || value.capacity === null)
    && (typeof value.cover_image_path === "string" || value.cover_image_path === null || value.cover_image_path === undefined)
    && typeof value.counts_for_attendance === "boolean"
    && (value.status === "draft" || value.status === "published" || value.status === "cancelled" || value.status === "completed")
    && typeof value.version === "number"
    && typeof value.attending_members === "number"
    && typeof value.attending_spots === "number"
    && (typeof value.remaining_spots === "number" || value.remaining_spots === null)
    && (value.my_response === null || value.my_response === "pending" || value.my_response === "attending" || value.my_response === "declined")
    && typeof value.my_guest_count === "number"
    && typeof value.my_note === "string"
    && typeof value.can_manage === "boolean"
    && typeof value.registration_open === "boolean";
}

export function parseEvents(value: unknown): ClubEvent[] | null {
  if (!isRecord(value) || !Array.isArray(value.events) || !value.events.every(isClubEvent)) return null;
  return value.events;
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function statusBadge(status: ClubEvent["status"]) {
  if (status === "published") return "badge badge-success";
  if (status === "cancelled") return "badge badge-danger";
  if (status === "draft") return "badge badge-warning";
  return "badge badge-neutral";
}

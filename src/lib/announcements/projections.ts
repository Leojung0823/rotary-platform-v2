export type AnnouncementClub = { club_id: string; club_code: string; club_name: string; membership_id: string; can_manage: boolean };
export type AnnouncementListItem = { id: string; club_id: string; title: string; excerpt: string; published_at: string; expire_at: string | null; pinned_until: string | null; read_at: string | null };
export type AnnouncementDetail = AnnouncementListItem & { body: string; first_seen_at: string; };
export type NotificationItem = { id: string; club_id: string; type: string; title: string; body: string; action_path: string; created_at: string; read_at: string | null };
export type ManageableAnnouncement = { id: string; title: string; status: string; publish_at: string | null; expire_at: string | null; pinned_until: string | null; created_at: string; updated_at: string; recipient_count: number };
export type Audience = { type: string; role_key?: string; membership_id?: string };
export type AnnouncementVersion = { version_number: number; title: string; body: string; audiences: Audience[]; transition: string; created_at: string };
export type AnnouncementAudit = { action: string; metadata: Record<string, unknown>; created_at: string };
export type ManageableAnnouncementDetail = ManageableAnnouncement & { club_id: string; body: string; cancel_reason: string | null; audiences: Audience[]; versions: AnnouncementVersion[]; audit: AnnouncementAudit[] };
export type DeliverySummary = { recipient_count: number; unread_count: number; delivery_count: number; pending_count: number; sent_count: number; failed_count: number };

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function pageItems<T>(value: unknown) {
  const root = record(value);
  return root && Array.isArray(root.items) ? root.items as T[] : null;
}

export const parseAnnouncementList = (value: unknown) => pageItems<AnnouncementListItem>(value);
export const parseNotificationList = (value: unknown) => pageItems<NotificationItem>(value);
export const parseManageableAnnouncements = (value: unknown) => pageItems<ManageableAnnouncement>(value);
export const parseAnnouncementDetail = (value: unknown) => record(value) as AnnouncementDetail | null;
export const parseManageableAnnouncement = (value: unknown) => record(value) as ManageableAnnouncementDetail | null;
export const parseDeliverySummary = (value: unknown) => record(value) as DeliverySummary | null;

export function formatAnnouncementTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Taipei" }).format(date);
}

export function announcementTimeInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  const taipei = new Date(date.valueOf() + 8 * 60 * 60 * 1_000);
  return taipei.toISOString().slice(0, 16);
}

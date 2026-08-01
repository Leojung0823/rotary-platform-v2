export type AnnouncementStatus = "draft" | "scheduled" | "published" | "expired" | "cancelled" | "archived";
export type AnnouncementRole = "president" | "secretary" | "finance" | "member";
export type AnnouncementAudience =
  | { type: "all_active_members" }
  | { type: "role"; role_key: AnnouncementRole }
  | { type: "membership"; membership_id: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const safePathPattern = /^\/(?!\/)[^\s]*$/u;
const roles = new Set(["president", "secretary", "finance", "member"]);

export function parseAnnouncementUuid(value: FormDataEntryValue | string | null | undefined) {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (!uuidPattern.test(parsed)) throw new Error("announcement_input_invalid");
  return parsed;
}

export function parseAnnouncementTitle(value: FormDataEntryValue | null) {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (parsed.length < 1 || parsed.length > 160) throw new Error("announcement_input_invalid");
  return parsed;
}

export function parseAnnouncementBody(value: FormDataEntryValue | null) {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (parsed.length < 1 || parsed.length > 12_000) throw new Error("announcement_input_invalid");
  return parsed;
}

export function parseOptionalAnnouncementTime(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw new Error("announcement_input_invalid");
  return parsed.toISOString();
}

export function validateAnnouncementTimes(publishAt: string | null, expireAt: string | null, pinnedUntil: string | null, now = Date.now()) {
  const publish = publishAt ? new Date(publishAt).valueOf() : now;
  if (publishAt && publish <= now) throw new Error("announcement_time_invalid");
  if (expireAt && new Date(expireAt).valueOf() <= publish) throw new Error("announcement_time_invalid");
  if (pinnedUntil && new Date(pinnedUntil).valueOf() < publish) throw new Error("announcement_time_invalid");
}

export function parseAnnouncementAudiences(formData: FormData): AnnouncementAudience[] {
  const type = formData.get("audienceType");
  if (type === "all_active_members") return [{ type }];
  if (type === "role") {
    const role = formData.get("roleKey");
    if (typeof role !== "string" || !roles.has(role)) throw new Error("announcement_audience_invalid");
    return [{ type, role_key: role as AnnouncementRole }];
  }
  if (type === "membership") {
    return [{ type, membership_id: parseAnnouncementUuid(formData.get("membershipId")) }];
  }
  throw new Error("announcement_audience_invalid");
}

export function requireConfirmed(value: FormDataEntryValue | null) {
  if (value !== "yes") throw new Error("announcement_confirmation_required");
}

export function isSafeAnnouncementActionPath(value: string) {
  return value.length <= 512 && safePathPattern.test(value);
}

export function canTransitionAnnouncement(from: AnnouncementStatus, to: AnnouncementStatus) {
  const transitions: Record<AnnouncementStatus, AnnouncementStatus[]> = {
    draft: ["scheduled", "published", "cancelled"],
    scheduled: ["published", "cancelled"],
    published: ["expired", "cancelled", "archived"],
    expired: ["archived"],
    cancelled: ["archived"],
    archived: [],
  };
  return transitions[from].includes(to);
}

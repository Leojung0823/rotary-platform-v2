import { APP_TIME_ZONE } from "@/lib/time";
import type { DiscussionAudienceKind } from "./contracts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function parseDiscussionUuid(value: string, errorCode = "invalid_discussion_id") {
  if (!uuidPattern.test(value)) throw new Error(errorCode);
  return value.toLowerCase();
}
export function parseDiscussionAudienceKind(value: FormDataEntryValue | null): DiscussionAudienceKind {
  if (value === "all" || value === "tags" || value === "people") return value;
  throw new Error("invalid_discussion_audience");
}
export function readDiscussionUuidList(formData: FormData, field: string, maximum: number) {
  const raw = formData.getAll(field);
  if (raw.length > maximum || raw.some((value) => typeof value !== "string" || !uuidPattern.test(value))) {
    throw new Error("invalid_discussion_audience");
  }
  const ids = raw.map((value) => String(value).toLowerCase());
  if (new Set(ids).size !== ids.length) throw new Error("invalid_discussion_audience");
  return ids;
}
export function parseDiscussionOptions(value: string) {
  const options = value.replace(/\r\n?/gu, "\n").split("\n").map((option) => option.trim()).filter(Boolean);
  if (options.length < 2 || options.length > 8
    || options.some((option) => Array.from(option).length > 100)
    || new Set(options.map((option) => option.toLocaleLowerCase("zh-TW"))).size !== options.length) {
    throw new Error("invalid_discussion_options");
  }
  return options;
}
/** Interpret datetime-local as the app's declared Taipei wall-clock time. */
export function parseTaipeiDateTimeLocal(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u.exec(value);
  if (!match) throw new Error("invalid_discussion_deadline");
  const [, year, month, day, hour, minute] = match;
  const date = new Date(value + ":00+08:00");
  if (!Number.isFinite(date.getTime())) throw new Error("invalid_discussion_deadline");
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  if (parts.year !== year || parts.month !== month || parts.day !== day
    || parts.hour !== hour || parts.minute !== minute) throw new Error("invalid_discussion_deadline");
  return date.toISOString();
}

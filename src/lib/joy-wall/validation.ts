import { decodeCursor, encodeCursor } from "@/lib/api/cursor";
import {
  joyCommentTypes,
  joyCreatablePostTypes,
  joyReactionTypes,
  joyReportReasons,
  joyVisibilityScopes,
} from "./contracts";

export const JOY_REQUEST_MAX_BYTES = 12_000;
export const JOY_POST_MAX_CODE_POINTS = 2_000;
export const JOY_COMMENT_MAX_CODE_POINTS = 1_000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}
function textLength(value: string) { return Array.from(value).length; }
function normalizedText(value: unknown, maximum: number, allowEmpty = false) {
  if (typeof value !== "string") throw new Error("invalid_text");
  const normalized = value.replace(/\r\n?/gu, "\n").trim();
  if ((!allowEmpty && normalized.length === 0) || textLength(normalized) > maximum) throw new Error("invalid_text");
  return normalized;
}
function uuid(value: unknown, code: string) {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw new Error(code);
  return value.toLowerCase();
}

export function parseJoyClubId(value: string | null) { return uuid(value, "invalid_club_id"); }
export function parseJoyPostId(value: string) { return uuid(value, "invalid_post_id"); }
export function parseJoyLimit(value: string | null) {
  if (value === null || value === "") return 20;
  if (!/^\d+$/u.test(value)) throw new Error("invalid_limit");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 50) throw new Error("invalid_limit");
  return parsed;
}
export function encodeJoyCursor(value: unknown) { return encodeCursor(value, "created_at"); }
export function decodeJoyCursor(value: string | null) {
  const decoded = decodeCursor(value, "created_at");
  return decoded && { createdAt: decoded.timestamp, id: decoded.id };
}

export function parseCreateJoyPostBody(value: unknown) {
  if (!isRecord(value) || !exactKeys(value, ["postType", "title", "content", "visibilityScope", "audienceMembershipIds"])) {
    throw new Error("invalid_body");
  }
  if (typeof value.postType !== "string" || !joyCreatablePostTypes.includes(value.postType as (typeof joyCreatablePostTypes)[number])
    || typeof value.visibilityScope !== "string" || !joyVisibilityScopes.includes(value.visibilityScope as (typeof joyVisibilityScopes)[number])) {
    throw new Error("invalid_body");
  }
  const title = value.title === null || value.title === undefined ? "" : normalizedText(value.title, 100, true);
  if (Array.from(title).length > 100) throw new Error("invalid_body");
  if (value.audienceMembershipIds !== undefined && !Array.isArray(value.audienceMembershipIds)) throw new Error("invalid_body");
  const rawAudience = (value.audienceMembershipIds ?? []) as unknown[];
  if (rawAudience.length > 25) throw new Error("invalid_body");
  const audienceMembershipIds = [...new Set(rawAudience.map((id) => uuid(id, "invalid_body")))];
  if (audienceMembershipIds.length !== rawAudience.length) throw new Error("invalid_body");
  if ((value.visibilityScope === "club" && audienceMembershipIds.length > 0)
    || (value.visibilityScope === "selected" && audienceMembershipIds.length === 0)
    || (value.visibilityScope === "private" && audienceMembershipIds.length !== 1)) {
    throw new Error("invalid_body");
  }
  return {
    postType: value.postType as (typeof joyCreatablePostTypes)[number],
    title: title || null,
    content: normalizedText(value.content, JOY_POST_MAX_CODE_POINTS),
    visibilityScope: value.visibilityScope as (typeof joyVisibilityScopes)[number],
    audienceMembershipIds,
  };
}

export function parseUpdateJoyPostBody(value: unknown) {
  if (!isRecord(value) || !exactKeys(value, ["postType", "title", "content"])) throw new Error("invalid_body");
  if (typeof value.postType !== "string" || !joyCreatablePostTypes.includes(value.postType as (typeof joyCreatablePostTypes)[number])) {
    throw new Error("invalid_body");
  }
  const title = value.title === null || value.title === undefined ? "" : normalizedText(value.title, 100, true);
  return {
    postType: value.postType as (typeof joyCreatablePostTypes)[number],
    title: title || null,
    content: normalizedText(value.content, JOY_POST_MAX_CODE_POINTS),
  };
}

function validDateOnly(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function parseCreateJoyIouBody(value: unknown) {
  if (!isRecord(value) || !exactKeys(value, ["recipientMembershipId", "title", "content", "dueOn"])) {
    throw new Error("invalid_body");
  }
  const title = value.title === null || value.title === undefined ? "" : normalizedText(value.title, 100, true);
  if (Array.from(title).length > 100 || (value.dueOn !== null && value.dueOn !== undefined && !validDateOnly(value.dueOn))) {
    throw new Error("invalid_body");
  }
  return {
    recipientMembershipId: uuid(value.recipientMembershipId, "invalid_body"),
    title: title || null,
    content: normalizedText(value.content, JOY_POST_MAX_CODE_POINTS),
    dueOn: (value.dueOn ?? null) as string | null,
  };
}

export const joyIouActions = ["accept", "decline", "start", "confirm_completion", "cancel"] as const;
export type JoyIouAction = (typeof joyIouActions)[number];

export function parseJoyIouActionBody(value: unknown) {
  if (!isRecord(value) || !exactKeys(value, ["action", "note"])
    || typeof value.action !== "string" || !joyIouActions.includes(value.action as JoyIouAction)) {
    throw new Error("invalid_body");
  }
  return {
    action: value.action as JoyIouAction,
    note: value.note === null || value.note === undefined ? null : normalizedText(value.note, 500),
  };
}

export function parseJoyCommentBody(value: unknown) {
  if (!isRecord(value) || !exactKeys(value, ["parentCommentId", "commentType", "content"])) throw new Error("invalid_body");
  if (typeof value.commentType !== "string" || !joyCommentTypes.includes(value.commentType as (typeof joyCommentTypes)[number])) {
    throw new Error("invalid_body");
  }
  return {
    parentCommentId: value.parentCommentId === null || value.parentCommentId === undefined
      ? null : uuid(value.parentCommentId, "invalid_body"),
    commentType: value.commentType as (typeof joyCommentTypes)[number],
    content: normalizedText(value.content, JOY_COMMENT_MAX_CODE_POINTS),
  };
}

export function parseJoyReactionBody(value: unknown) {
  if (!isRecord(value) || !exactKeys(value, ["reactionType"]) || typeof value.reactionType !== "string"
    || !joyReactionTypes.includes(value.reactionType as (typeof joyReactionTypes)[number])) throw new Error("invalid_body");
  return value.reactionType as (typeof joyReactionTypes)[number];
}

export function parseJoyFavoriteBody(value: unknown) {
  if (!isRecord(value) || !exactKeys(value, ["isFavorite"]) || typeof value.isFavorite !== "boolean") {
    throw new Error("invalid_body");
  }
  return value.isFavorite;
}

export function parseJoyReportBody(value: unknown) {
  if (!isRecord(value) || !exactKeys(value, ["reason"]) || typeof value.reason !== "string"
    || !joyReportReasons.includes(value.reason as (typeof joyReportReasons)[number])) throw new Error("invalid_body");
  return value.reason as (typeof joyReportReasons)[number];
}

export function parseJoyQuestionPromptId(value: string) { return uuid(value, "invalid_prompt_id"); }

export function parseCreateJoyQuestionPromptBody(value: unknown) {
  if (!isRecord(value) || !exactKeys(value, ["promptText"])) throw new Error("invalid_body");
  const promptText = normalizedText(value.promptText, 200);
  if (Array.from(promptText).length < 5) throw new Error("invalid_body");
  return { promptText };
}

export function parseUpdateJoyQuestionPromptBody(value: unknown) {
  if (!isRecord(value) || !exactKeys(value, ["promptText", "isActive", "sortOrder"])
    || typeof value.isActive !== "boolean" || !Number.isSafeInteger(value.sortOrder)
    || Number(value.sortOrder) < 0 || Number(value.sortOrder) > 10000) {
    throw new Error("invalid_body");
  }
  const promptText = normalizedText(value.promptText, 200);
  if (Array.from(promptText).length < 5) throw new Error("invalid_body");
  return {
    promptText,
    isActive: value.isActive,
    sortOrder: Number(value.sortOrder),
  };
}

export function parseJoyQuestionBatchBody(value: unknown) {
  if (!isRecord(value) || !exactKeys(value, ["title", "recipientMembershipIds", "requestId", "dueOn"])
    || !Array.isArray(value.recipientMembershipIds) || value.recipientMembershipIds.length < 1
    || value.recipientMembershipIds.length > 250
    || (value.dueOn !== undefined && value.dueOn !== null && !validDateOnly(value.dueOn))) throw new Error("invalid_body");
  const recipientMembershipIds = value.recipientMembershipIds.map((id) => uuid(id, "invalid_body"));
  if (new Set(recipientMembershipIds).size !== recipientMembershipIds.length) throw new Error("invalid_body");
  return {
    title: normalizedText(value.title, 100),
    recipientMembershipIds,
    requestId: uuid(value.requestId, "invalid_body"),
    dueOn: (value.dueOn ?? null) as string | null,
  };
}

export function parseJoyQuestionBatchId(value: string) { return uuid(value, "invalid_batch_id"); }

export function parseJoyModerationBody(value: unknown) {
  if (!isRecord(value) || !exactKeys(value, ["action", "reviewerNote"])
    || (value.action !== "hide" && value.action !== "dismiss")) throw new Error("invalid_body");
  return {
    action: value.action,
    reviewerNote: value.reviewerNote === null || value.reviewerNote === undefined
      ? null : normalizedText(value.reviewerNote, 500),
  };
}

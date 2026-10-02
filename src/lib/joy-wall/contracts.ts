export const joyPostTypes = ["blessing", "gratitude", "welcome", "encouragement", "memory", "question", "other", "iou"] as const;
export type JoyPostType = (typeof joyPostTypes)[number];
export const joyCreatablePostTypes = joyPostTypes.filter((type) => type !== "iou") as Exclude<JoyPostType, "iou">[];
export const joyVisibilityScopes = ["club", "selected", "private"] as const;
export type JoyVisibilityScope = (typeof joyVisibilityScopes)[number];
export const joyCommentTypes = ["comment", "blessing", "encouragement", "question", "answer"] as const;
export type JoyCommentType = (typeof joyCommentTypes)[number];
export const joyReactionTypes = ["heart", "thanks", "celebrate", "support", "laugh"] as const;
export type JoyReactionType = (typeof joyReactionTypes)[number];
export const joyReportReasons = ["spam", "harassment", "privacy", "inappropriate", "other"] as const;
export type JoyReportReason = (typeof joyReportReasons)[number];

export type JoyIouStatus = "proposed" | "accepted" | "declined" | "in_progress" | "completed" | "cancelled";
export type JoyIouProjection = {
  status: JoyIouStatus;
  is_overdue: boolean;
  due_on: string | null;
  recipient_display_name: string;
  viewer_role: "promisor" | "recipient";
  can_accept: boolean;
  can_decline: boolean;
  can_start: boolean;
  can_confirm_completion: boolean;
  can_cancel: boolean;
  recipient_response_note: string | null;
  cancellation_note: string | null;
  promisor_completion_confirmed: boolean;
  recipient_completion_confirmed: boolean;
  promisor_completion_note: string | null;
  recipient_completion_note: string | null;
};

export type JoyPost = {
  id: string;
  post_type: JoyPostType;
  title: string | null;
  content: string;
  visibility_scope: JoyVisibilityScope;
  post_status: "published" | "hidden";
  created_at: string;
  updated_at: string;
  author_display_name: string;
  author_avatar_url: string | null;
  can_edit: boolean;
  can_archive: boolean;
  can_answer: boolean;
  is_hidden: boolean;
  comment_count: number;
  reaction_counts: Partial<Record<JoyReactionType, number>>;
  my_reaction: JoyReactionType | null;
  iou: JoyIouProjection | null;
};

export type JoyComment = {
  id: string;
  parent_comment_id: string | null;
  comment_type: JoyCommentType;
  content: string;
  created_at: string;
  author_display_name: string;
  author_avatar_url: string | null;
  can_delete: boolean;
};

export type JoyAudienceMember = { membership_id: string; display_name: string; avatar_url: string | null };
export type JoyReport = {
  report_id: string;
  post_id: string;
  reason: JoyReportReason;
  created_at: string;
  post_title: string | null;
  post_content: string;
  post_type: JoyPostType;
  post_status: "published" | "hidden" | "archived";
  author_display_name: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isOneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value);
}
function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function safeHttpUrl(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch { return false; }
}

function parseJoyIou(value: unknown): JoyIouProjection {
  if (!isRecord(value)) throw new Error("invalid_joy_iou_projection");
  const statuses: readonly JoyIouStatus[] = ["proposed", "accepted", "declined", "in_progress", "completed", "cancelled"];
  const dueOn = value.due_on;
  const dateIsValid = dueOn === null || (typeof dueOn === "string"
    && /^\d{4}-\d{2}-\d{2}$/u.test(dueOn)
    && Number.isFinite(Date.parse(`${dueOn}T00:00:00Z`))
    && new Date(`${dueOn}T00:00:00Z`).toISOString().slice(0, 10) === dueOn);
  if (typeof value.status !== "string" || !statuses.includes(value.status as JoyIouStatus)
    || typeof value.is_overdue !== "boolean" || !dateIsValid
    || typeof value.recipient_display_name !== "string"
    || (value.viewer_role !== "promisor" && value.viewer_role !== "recipient")
    || typeof value.can_accept !== "boolean" || typeof value.can_decline !== "boolean"
    || typeof value.can_start !== "boolean" || typeof value.can_confirm_completion !== "boolean"
    || typeof value.can_cancel !== "boolean"
    || (value.recipient_response_note !== null && typeof value.recipient_response_note !== "string")
    || (value.cancellation_note !== null && typeof value.cancellation_note !== "string")
    || typeof value.promisor_completion_confirmed !== "boolean"
    || typeof value.recipient_completion_confirmed !== "boolean"
    || (value.promisor_completion_note !== null && typeof value.promisor_completion_note !== "string")
    || (value.recipient_completion_note !== null && typeof value.recipient_completion_note !== "string")) {
    throw new Error("invalid_joy_iou_projection");
  }
  return value as JoyIouProjection;
}

export function parseJoyPost(value: unknown): JoyPost {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || !isOneOf(joyPostTypes, value.post_type)
    || (value.title !== null && typeof value.title !== "string")
    || typeof value.content !== "string"
    || !isOneOf(joyVisibilityScopes, value.visibility_scope)
    || (value.post_status !== "published" && value.post_status !== "hidden")
    || !isTimestamp(value.created_at) || !isTimestamp(value.updated_at)
    || typeof value.author_display_name !== "string"
    || !safeHttpUrl(value.author_avatar_url)
    || typeof value.can_edit !== "boolean" || typeof value.can_archive !== "boolean"
    || typeof value.can_answer !== "boolean"
    || typeof value.is_hidden !== "boolean"
    || !Number.isInteger(value.comment_count) || Number(value.comment_count) < 0
    || !isRecord(value.reaction_counts)
    || (value.my_reaction !== null && !isOneOf(joyReactionTypes, value.my_reaction))
    || (value.post_type === "iou" ? value.iou === null : value.iou !== null)) {
    throw new Error("invalid_joy_post_projection");
  }
  const reactions: Partial<Record<JoyReactionType, number>> = {};
  for (const [key, count] of Object.entries(value.reaction_counts)) {
    if (!isOneOf(joyReactionTypes, key) || !Number.isInteger(count) || Number(count) < 0) {
      throw new Error("invalid_joy_post_projection");
    }
    reactions[key] = Number(count);
  }
  return {
    id: value.id,
    post_type: value.post_type,
    title: value.title as string | null,
    content: value.content,
    visibility_scope: value.visibility_scope,
    post_status: value.post_status,
    created_at: value.created_at,
    updated_at: value.updated_at,
    author_display_name: value.author_display_name,
    author_avatar_url: value.author_avatar_url,
    can_edit: value.can_edit,
    can_archive: value.can_archive,
    can_answer: value.can_answer,
    is_hidden: value.is_hidden,
    comment_count: Number(value.comment_count),
    reaction_counts: reactions,
    my_reaction: value.my_reaction as JoyReactionType | null,
    iou: value.iou === null ? null : parseJoyIou(value.iou),
  };
}

export function parseJoyPosts(value: unknown): { posts: JoyPost[]; nextCursor: unknown | null } {
  if (!isRecord(value) || !Array.isArray(value.posts)) throw new Error("invalid_joy_list_projection");
  return { posts: value.posts.map(parseJoyPost), nextCursor: value.next_cursor ?? null };
}

export function parseJoyComment(value: unknown): JoyComment {
  if (!isRecord(value) || typeof value.id !== "string"
    || (value.parent_comment_id !== null && typeof value.parent_comment_id !== "string")
    || !isOneOf(joyCommentTypes, value.comment_type) || typeof value.content !== "string"
    || !isTimestamp(value.created_at) || typeof value.author_display_name !== "string"
    || !safeHttpUrl(value.author_avatar_url) || typeof value.can_delete !== "boolean") {
    throw new Error("invalid_joy_comment_projection");
  }
  return {
    id: value.id,
    parent_comment_id: value.parent_comment_id,
    comment_type: value.comment_type,
    content: value.content,
    created_at: value.created_at,
    author_display_name: value.author_display_name,
    author_avatar_url: value.author_avatar_url,
    can_delete: value.can_delete,
  };
}

export function parseJoyComments(value: unknown): JoyComment[] {
  if (!isRecord(value) || !Array.isArray(value.comments)) throw new Error("invalid_joy_comments_projection");
  return value.comments.map(parseJoyComment);
}

export function parseJoyAudienceMembers(value: unknown): JoyAudienceMember[] {
  if (!Array.isArray(value)) throw new Error("invalid_joy_audience_projection");
  return value.flatMap((row) => {
    if (!isRecord(row) || typeof row.membership_id !== "string"
      || typeof row.display_name !== "string" || !safeHttpUrl(row.avatar_url)) return [];
    return [{ membership_id: row.membership_id, display_name: row.display_name, avatar_url: row.avatar_url }];
  });
}

export function parseJoyReports(value: unknown): JoyReport[] {
  if (!isRecord(value) || !Array.isArray(value.reports)) throw new Error("invalid_joy_reports_projection");
  return value.reports.flatMap((row) => {
    if (!isRecord(row) || typeof row.report_id !== "string" || typeof row.post_id !== "string"
      || !isOneOf(joyReportReasons, row.reason) || !isTimestamp(row.created_at)
      || (row.post_title !== null && typeof row.post_title !== "string")
      || typeof row.post_content !== "string" || !isOneOf(joyPostTypes, row.post_type)
      || !["published", "hidden", "archived"].includes(String(row.post_status))
      || typeof row.author_display_name !== "string") return [];
    return [{
      report_id: row.report_id,
      post_id: row.post_id,
      reason: row.reason,
      created_at: row.created_at,
      post_title: row.post_title as string | null,
      post_content: row.post_content,
      post_type: row.post_type,
      post_status: row.post_status as JoyReport["post_status"],
      author_display_name: row.author_display_name,
    }];
  });
}

export const joyPostTypes = ["blessing", "gratitude", "welcome", "encouragement", "memory", "question", "other", "iou"] as const;
export type JoyPostType = (typeof joyPostTypes)[number];
export const joyCreatablePostTypes = joyPostTypes.filter((type) => type !== "iou") as Exclude<JoyPostType, "iou">[];
export const joyVisibilityScopes = ["club", "selected", "private"] as const;
export type JoyVisibilityScope = (typeof joyVisibilityScopes)[number];
export const joyCommentTypes = ["comment", "blessing", "encouragement", "question", "answer"] as const;
export type JoyCommentType = (typeof joyCommentTypes)[number];
export const joyReactionTypes = ["heart", "thanks", "celebrate", "support", "laugh"] as const;
export type JoyReactionType = (typeof joyReactionTypes)[number];
export const joyReportReasons = ["spam", "harassment", "privacy", "inappropriate", "other", "recipient_hide_request"] as const;
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
  is_favorited: boolean;
  can_acknowledge_receipt: boolean;
  receipt_acknowledged_at: string | null;
  receipt_ack_count: number | null;
  recipient_count: number | null;
  can_request_hide: boolean;
  hide_request_submitted: boolean;
  comment_count: number;
  reaction_counts: Partial<Record<JoyReactionType, number>>;
  my_reaction: JoyReactionType | null;
  iou: JoyIouProjection | null;
  targets: JoyPostTarget[];
};

export type JoyPostTarget = {
  target_type: "event" | "rotary_year" | "role" | "birthday_campaign";
  target_id: string;
  label: string;
  detail: string | null;
};

export type JoyTargetOptions = {
  events: Array<{ id: string; title: string; starts_at: string }>;
  rotary_years: Array<{ id: string; start_year: number; theme: string | null }>;
  roles: Array<{ role_key: string; label: string }>;
  birthday_campaigns: Array<{ id: string; recipient_name: string; birthday_year: number }>;
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

export type JoySuggestion = {
  suggestion_id: string;
  content: string;
  status: "open";
  created_at: string;
};

export function parseJoySuggestions(value: unknown): JoySuggestion[] {
  if (!isRecord(value) || !Array.isArray(value.suggestions)) throw new Error("invalid_joy_suggestions_projection");
  return value.suggestions.map((row): JoySuggestion => {
    if (!isRecord(row) || typeof row.suggestion_id !== "string" || typeof row.content !== "string"
      || row.status !== "open" || !isTimestamp(row.created_at)
      || row.content.trim().length === 0 || Array.from(row.content).length > 1000
      || Object.keys(row).some((key) => !["suggestion_id", "content", "status", "created_at"].includes(key))) {
      throw new Error("invalid_joy_suggestions_projection");
    }
    return row as JoySuggestion;
  });
}

export type JoyQuestionPrompt = {
  id: string;
  prompt_text: string;
  source: "platform" | "club";
  is_active: boolean;
  sort_order: number;
  can_edit: boolean;
};
export type JoyQuestionBatchSummary = {
  id: string;
  title: string;
  created_at: string;
  due_on: string | null;
  assignment_count: number;
  answered_count: number;
  unavailable_count: number;
};
export type JoyQuestionManagerPage = {
  prompts: JoyQuestionPrompt[];
  batches: JoyQuestionBatchSummary[];
  distinct_active_prompt_count: number;
};
export type JoyQuestionRecipient = {
  membership_id: string;
  display_name: string;
  avatar_url: string | null;
};
export type JoyQuestionBatchDetail = {
  id: string;
  title: string;
  created_at: string;
  due_on: string | null;
  assignments: Array<{
    post_id: string;
    recipient_membership_id: string;
    recipient_display_name: string;
    prompt_text: string;
    answered: boolean;
    available: boolean;
  }>;
};

export function parseJoyQuestionPrompt(value: unknown): JoyQuestionPrompt {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.prompt_text !== "string"
    || (value.source !== "platform" && value.source !== "club")
    || typeof value.is_active !== "boolean" || !Number.isSafeInteger(value.sort_order)
    || typeof value.can_edit !== "boolean" || value.can_edit !== (value.source === "club")
    || value.prompt_text.trim().length === 0 || Array.from(value.prompt_text).length > 200) {
    throw new Error("invalid_joy_question_prompt");
  }
  return value as JoyQuestionPrompt;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isOneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value);
}
function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function isDateOnly(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function safeHttpUrl(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch { return false; }
}

function parseJoyPostTarget(value: unknown): JoyPostTarget {
  if (!isRecord(value)
    || (value.target_type !== "event" && value.target_type !== "rotary_year"
      && value.target_type !== "role" && value.target_type !== "birthday_campaign")
    || typeof value.target_id !== "string"
    || typeof value.label !== "string" || value.label.trim().length === 0 || Array.from(value.label).length > 180
    || (value.detail !== null && typeof value.detail !== "string")
    || (typeof value.detail === "string" && Array.from(value.detail).length > 180)) {
    throw new Error("invalid_joy_post_target");
  }
  return value as JoyPostTarget;
}

export function parseJoyTargetOptions(value: unknown): JoyTargetOptions {
  if (!isRecord(value) || !Array.isArray(value.events) || !Array.isArray(value.rotary_years)
    || !Array.isArray(value.roles) || !Array.isArray(value.birthday_campaigns)
    || value.events.length > 200 || value.rotary_years.length > 100
    || value.roles.length > 10 || value.birthday_campaigns.length > 500) {
    throw new Error("invalid_joy_target_options");
  }
  const events = value.events.map((event): JoyTargetOptions["events"][number] => {
    if (!isRecord(event) || typeof event.id !== "string"
      || typeof event.title !== "string" || event.title.trim().length === 0 || Array.from(event.title).length > 160
      || !isTimestamp(event.starts_at)) throw new Error("invalid_joy_target_options");
    return { id: event.id, title: event.title, starts_at: event.starts_at };
  });
  const rotaryYears = value.rotary_years.map((year): JoyTargetOptions["rotary_years"][number] => {
    if (!isRecord(year) || typeof year.id !== "string" || typeof year.start_year !== "number"
      || !Number.isSafeInteger(year.start_year)
      || Number(year.start_year) < 2000 || Number(year.start_year) > 2200
      || (year.theme !== null && typeof year.theme !== "string")
      || (typeof year.theme === "string" && Array.from(year.theme).length > 160)) {
      throw new Error("invalid_joy_target_options");
    }
    return { id: year.id, start_year: Number(year.start_year), theme: year.theme as string | null };
  });
  const roles = value.roles.map((role): JoyTargetOptions["roles"][number] => {
    if (!isRecord(role) || typeof role.role_key !== "string"
      || !/^[a-z][a-z0-9_]{0,39}$/u.test(role.role_key)
      || typeof role.label !== "string" || role.label.trim().length === 0 || Array.from(role.label).length > 80) {
      throw new Error("invalid_joy_target_options");
    }
    return { role_key: role.role_key, label: role.label };
  });
  const birthdayCampaigns = value.birthday_campaigns.map((campaign): JoyTargetOptions["birthday_campaigns"][number] => {
    if (!isRecord(campaign) || typeof campaign.id !== "string"
      || typeof campaign.recipient_name !== "string" || campaign.recipient_name.trim().length === 0
      || Array.from(campaign.recipient_name).length > 120
      || typeof campaign.birthday_year !== "number" || !Number.isSafeInteger(campaign.birthday_year)
      || campaign.birthday_year < 2000 || campaign.birthday_year > 2200) {
      throw new Error("invalid_joy_target_options");
    }
    return { id: campaign.id, recipient_name: campaign.recipient_name, birthday_year: campaign.birthday_year };
  });
  if (new Set(events.map((event) => event.id)).size !== events.length
    || new Set(rotaryYears.map((year) => year.id)).size !== rotaryYears.length
    || new Set(roles.map((role) => role.role_key)).size !== roles.length
    || new Set(birthdayCampaigns.map((campaign) => campaign.id)).size !== birthdayCampaigns.length) {
    throw new Error("invalid_joy_target_options");
  }
  return { events, rotary_years: rotaryYears, roles, birthday_campaigns: birthdayCampaigns };
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
    || (value.is_favorited !== undefined && typeof value.is_favorited !== "boolean")
    || (value.can_acknowledge_receipt !== undefined && typeof value.can_acknowledge_receipt !== "boolean")
    || (value.receipt_acknowledged_at !== undefined && value.receipt_acknowledged_at !== null && !isTimestamp(value.receipt_acknowledged_at))
    || (value.receipt_ack_count !== undefined && value.receipt_ack_count !== null
      && (!Number.isInteger(value.receipt_ack_count) || Number(value.receipt_ack_count) < 0))
    || (value.recipient_count !== undefined && value.recipient_count !== null
      && (!Number.isInteger(value.recipient_count) || Number(value.recipient_count) < 0))
    || (value.can_request_hide !== undefined && typeof value.can_request_hide !== "boolean")
    || (value.hide_request_submitted !== undefined && typeof value.hide_request_submitted !== "boolean")
    || (value.targets !== undefined && (!Array.isArray(value.targets) || value.targets.length > 20))
    || !Number.isInteger(value.comment_count) || Number(value.comment_count) < 0
    || !isRecord(value.reaction_counts)
    || (value.my_reaction !== null && !isOneOf(joyReactionTypes, value.my_reaction))
    || (value.can_acknowledge_receipt === true && value.receipt_acknowledged_at != null)
    || (value.can_request_hide === true && value.hide_request_submitted === true)
    || (value.receipt_ack_count != null && value.recipient_count != null
      && Number(value.receipt_ack_count) > Number(value.recipient_count))
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
  const targets = (value.targets ?? []).map(parseJoyPostTarget);
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
    is_favorited: value.is_favorited === true,
    can_acknowledge_receipt: value.can_acknowledge_receipt === true,
    receipt_acknowledged_at: value.receipt_acknowledged_at as string | null ?? null,
    receipt_ack_count: value.receipt_ack_count as number | null ?? null,
    recipient_count: value.recipient_count as number | null ?? null,
    can_request_hide: value.can_request_hide === true,
    hide_request_submitted: value.hide_request_submitted === true,
    comment_count: Number(value.comment_count),
    reaction_counts: reactions,
    my_reaction: value.my_reaction as JoyReactionType | null,
    iou: value.iou === null ? null : parseJoyIou(value.iou),
    targets,
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

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

export function parseJoyQuestionManagerPage(value: unknown): JoyQuestionManagerPage {
  if (!isRecord(value) || !Array.isArray(value.prompts) || !Array.isArray(value.batches)
    || !isNonNegativeInteger(value.distinct_active_prompt_count)) {
    throw new Error("invalid_joy_question_manager_page");
  }
  const prompts = value.prompts.map(parseJoyQuestionPrompt);
  const batches = value.batches.map((batch): JoyQuestionBatchSummary => {
    const dueOn = isRecord(batch) ? batch.due_on : undefined;
    if (!isRecord(batch) || typeof batch.id !== "string" || typeof batch.title !== "string"
      || !isTimestamp(batch.created_at) || !isNonNegativeInteger(batch.assignment_count)
      || !(dueOn === null || isDateOnly(dueOn))
      || !isNonNegativeInteger(batch.answered_count) || !isNonNegativeInteger(batch.unavailable_count)
      || Number(batch.answered_count) > Number(batch.assignment_count)
      || Number(batch.unavailable_count) > Number(batch.assignment_count)) {
      throw new Error("invalid_joy_question_manager_page");
    }
    return batch as JoyQuestionBatchSummary;
  });
  return {
    prompts,
    batches,
    distinct_active_prompt_count: value.distinct_active_prompt_count,
  };
}

export function parseJoyQuestionRecipients(value: unknown): JoyQuestionRecipient[] {
  if (!Array.isArray(value)) throw new Error("invalid_joy_question_recipients");
  return value.map((recipient): JoyQuestionRecipient => {
    if (!isRecord(recipient) || typeof recipient.membership_id !== "string"
      || typeof recipient.display_name !== "string" || !safeHttpUrl(recipient.avatar_url)) {
      throw new Error("invalid_joy_question_recipients");
    }
    return recipient as JoyQuestionRecipient;
  });
}

export function parseJoyQuestionBatchDetail(value: unknown): JoyQuestionBatchDetail {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string"
    || !isTimestamp(value.created_at) || !Array.isArray(value.assignments)) {
    throw new Error("invalid_joy_question_batch_detail");
  }
  if (!(value.due_on === null || isDateOnly(value.due_on))) {
    throw new Error("invalid_joy_question_batch_detail");
  }
  const assignments = value.assignments.map((assignment) => {
    if (!isRecord(assignment) || typeof assignment.post_id !== "string"
      || typeof assignment.recipient_membership_id !== "string"
      || typeof assignment.recipient_display_name !== "string"
      || typeof assignment.prompt_text !== "string" || typeof assignment.answered !== "boolean"
      || typeof assignment.available !== "boolean") {
      throw new Error("invalid_joy_question_batch_detail");
    }
    return assignment as JoyQuestionBatchDetail["assignments"][number];
  });
  return { id: value.id, title: value.title, created_at: value.created_at, due_on: value.due_on, assignments };
}

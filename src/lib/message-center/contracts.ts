export type ClubMessage = {
  id: string;
  title: string;
  body: string;
  audience_kind: "everyone" | "tags" | "members";
  action_path: string | null;
  action_status: "pending" | "completed" | "declined" | "needs_resubmission" | "disabled" | null;
  published_at: string;
  author_display_name: string;
  read_at: string | null;
};

export type ClubMessageInbox = {
  messages: ClubMessage[];
  unreadCount: number;
  nextCursorPayload: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAudienceKind(value: unknown): value is ClubMessage["audience_kind"] {
  return value === "everyone" || value === "tags" || value === "members";
}

const safeActionPathPattern = /^\/[A-Za-z0-9][-A-Za-z0-9/?=&._%]{0,498}$/u;
const actionStatuses = ["pending", "completed", "declined", "needs_resubmission", "disabled"] as const;

function parseActionPath(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !safeActionPathPattern.test(value) || value.startsWith("//")) {
    throw new Error("invalid_message_projection");
  }
  return value;
}

function parseActionStatus(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !actionStatuses.includes(value as typeof actionStatuses[number])) {
    throw new Error("invalid_message_projection");
  }
  return value as typeof actionStatuses[number];
}

export function parseClubMessage(value: unknown): ClubMessage {
  if (!isRecord(value)) throw new Error("invalid_message_projection");
  const readAt = value.read_at;
  if (
    typeof value.id !== "string"
    || typeof value.title !== "string"
    || typeof value.body !== "string"
    || !isAudienceKind(value.audience_kind)
    || typeof value.published_at !== "string"
    || typeof value.author_display_name !== "string"
    || (readAt !== null && readAt !== undefined && typeof readAt !== "string")
  ) {
    throw new Error("invalid_message_projection");
  }

  return {
    id: value.id,
    title: value.title,
    body: value.body,
    audience_kind: value.audience_kind,
    action_path: parseActionPath(value.action_path),
    action_status: parseActionStatus(value.action_status),
    published_at: value.published_at,
    author_display_name: value.author_display_name,
    read_at: typeof readAt === "string" ? readAt : null,
  };
}

function parseCount(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error("invalid_message_projection");
  }
  return value;
}

export function parseClubMessageInbox(value: unknown): ClubMessageInbox {
  if (!isRecord(value) || !Array.isArray(value.messages)) throw new Error("invalid_message_projection");
  return {
    messages: value.messages.map(parseClubMessage),
    unreadCount: parseCount(value.unread_count),
    nextCursorPayload: value.next_cursor ?? null,
  };
}

export function parseReadReceipt(value: unknown) {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.read_at !== "string") {
    throw new Error("invalid_message_projection");
  }
  return { id: value.id, read_at: value.read_at, unread_count: parseCount(value.unread_count) };
}

export type MessageDelivery = {
  membership_id: string;
  display_name: string;
  read_at: string | null;
};

export type MessageDeliveries = {
  message_id: string;
  recipient_count: number;
  read_count: number;
  recipients: MessageDelivery[];
};

export function parseMessageDeliveries(value: unknown): MessageDeliveries {
  if (!isRecord(value) || typeof value.message_id !== "string" || !Array.isArray(value.recipients)) {
    throw new Error("invalid_message_projection");
  }
  return {
    message_id: value.message_id,
    recipient_count: parseCount(value.recipient_count),
    read_count: parseCount(value.read_count),
    recipients: value.recipients.map((entry) => {
      if (!isRecord(entry) || typeof entry.membership_id !== "string"
        || typeof entry.display_name !== "string"
        || (entry.read_at !== null && typeof entry.read_at !== "string")) {
        throw new Error("invalid_message_projection");
      }
      return {
        membership_id: entry.membership_id,
        display_name: entry.display_name,
        read_at: entry.read_at,
      };
    }),
  };
}

export type SentClubMessage = ClubMessage & {
  recipient_count: number;
  read_count: number;
  audience_tag_names: string[];
};

export function parseSentClubMessages(value: unknown): SentClubMessage[] {
  if (!Array.isArray(value)) throw new Error("invalid_message_projection");
  return value.map((entry) => {
    if (!isRecord(entry)) throw new Error("invalid_message_projection");
    const names = entry.audience_tag_names;
    if (!Array.isArray(names) || names.some((name) => typeof name !== "string")) {
      throw new Error("invalid_message_projection");
    }
    // A sent message has no read state of its own; the author's own copy is
    // reported in their inbox, not here.
    return {
      ...parseClubMessage({ ...entry, read_at: null }),
      recipient_count: parseCount(entry.recipient_count),
      read_count: parseCount(entry.read_count),
      audience_tag_names: names as string[],
    };
  });
}

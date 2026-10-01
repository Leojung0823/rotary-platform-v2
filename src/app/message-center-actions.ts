"use server";

import { pushClubMessageToLine } from "@/lib/line/message-center-push";
import type { MessagePushOutcome } from "@/lib/line/message-push-outcome";
import {
  parseClubMessage,
  parseClubMessageLifecycle,
  parseClubMessageLifecycleList,
  parseReadReceipt,
} from "@/lib/message-center/contracts";
import {
  normalizeMessageBody,
  normalizeMessageTitle,
} from "@/lib/message-center/validation";
import { createClient } from "@/lib/supabase/server";

// Mutations are server actions rather than API routes. The audience picker
// already emits hidden inputs for an ordinary form, the rest of this app sends
// from forms this way (the LINE OA push, the event form), and Next's own
// origin check covers them -- so the message centre does not need a second
// request-guarding mechanism of its own. Reads stay on `/api/v1/messages`,
// where the browser fetches further pages and the delivery list.

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type MessageActionResult =
  // `linePush` describes an echo of the message, never the message itself: the
  // row is committed either way, so a failed push must not read as a failed send.
  | { ok: true; message: ReturnType<typeof parseClubMessage>; linePush?: MessagePushOutcome }
  | { ok: false; reason: "invalid_input" | "forbidden" | "failed" };

export type ReadActionResult =
  | { ok: true; readAt: string; unreadCount: number }
  | { ok: false; reason: "forbidden" | "failed" };

export type MessageLifecycleActionResult =
  | { ok: true; message: ReturnType<typeof parseClubMessageLifecycle> }
  | {
      ok: false;
      reason: "invalid_input" | "forbidden" | "schedule_failed" | "failed";
      persisted?: ReturnType<typeof parseClubMessageLifecycle>;
    };

// The message centre is a client component that calls these actions
// imperatively and keeps its own inbox, sent and delivery state. Revalidating
// this route here would re-render the Server Component that produced the page
// and throw away the state the client had just updated, so a sent or withdrawn
// message would visibly flicker back. Nothing is lost by omitting it: the
// action returns the durable row, and the next navigation reads Supabase
// directly. Other action modules still revalidate, because they are submitted
// through <form action={...}> and do want the server round trip.

function uuidList(values: readonly unknown[]) {
  return Array.from(new Set(values.map((value) => String(value).trim().toLowerCase())))
    .filter((value) => uuidPattern.test(value));
}

// The database refuses the pair as well; this keeps a malformed submission
// from reaching it as a confusing error the officer cannot act on.
function audienceFrom(formData: FormData) {
  const tagIds = uuidList(formData.getAll("audienceTagIds"));
  const membershipIds = uuidList(formData.getAll("audienceMembershipIds"));
  return tagIds.length > 0 && membershipIds.length > 0 ? null : { tagIds, membershipIds };
}

function failureReason(error: { code?: string | null } | null): "forbidden" | "failed" {
  return error?.code === "42501" ? "forbidden" : "failed";
}

export async function sendClubMessageAction(formData: FormData): Promise<MessageActionResult> {
  const clubId = String(formData.get("clubId") ?? "").toLowerCase();
  if (!uuidPattern.test(clubId)) return { ok: false, reason: "invalid_input" };

  let title: string;
  let body: string;
  try {
    title = normalizeMessageTitle(formData.get("title"));
    body = normalizeMessageBody(formData.get("body"));
  } catch {
    return { ok: false, reason: "invalid_input" };
  }

  const audience = audienceFrom(formData);
  if (!audience) return { ok: false, reason: "invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_club_message", {
    p_club_id: clubId,
    p_title: title,
    p_body: body,
    p_tag_ids: audience.tagIds,
    p_membership_ids: audience.membershipIds,
  });
  if (error) return { ok: false, reason: failureReason(error) };

  let message: ReturnType<typeof parseClubMessage>;
  try {
    message = parseClubMessage({ ...(data as object), read_at: null });
  } catch {
    return { ok: false, reason: "failed" };
  }

  // The push runs after the message exists so a member who opens LINE and taps
  // through always finds the message centre row already there.
  const linePush = await pushClubMessageToLine({
    supabase,
    clubId,
    messageId: message.id,
    title,
    body,
  }).catch((): MessagePushOutcome => ({ status: "failed", reason: "unexpected" }));

  return { ok: true, message, linePush };
}

export async function markClubMessageReadAction(
  clubId: string,
  messageId: string,
): Promise<ReadActionResult> {
  if (!uuidPattern.test(clubId) || !uuidPattern.test(messageId)) {
    return { ok: false, reason: "failed" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_club_message_read", {
    p_club_id: clubId.toLowerCase(),
    p_message_id: messageId.toLowerCase(),
  });
  if (error) return { ok: false, reason: failureReason(error) };

  try {
    const receipt = parseReadReceipt(data);
    return { ok: true, readAt: receipt.read_at, unreadCount: receipt.unread_count };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

export async function withdrawClubMessageAction(
  clubId: string,
  messageId: string,
): Promise<{ ok: boolean }> {
  if (!uuidPattern.test(clubId) || !uuidPattern.test(messageId)) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_club_message", {
    p_club_id: clubId.toLowerCase(),
    p_message_id: messageId.toLowerCase(),
  });
  return { ok: !error };
}

function readOptionalIsoDate(value: FormDataEntryValue | null) {
  if (value === null || value === "") return { ok: true as const, value: null };
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value)) {
    return { ok: false as const };
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { ok: false as const };
  return { ok: true as const, value: parsed.toISOString() };
}

async function readLifecycleMessage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clubId: string,
  messageId: string,
) {
  const { data, error } = await supabase.rpc("list_club_message_lifecycle", {
    p_club_id: clubId,
    p_limit: 100,
  });
  if (error) return null;
  try {
    return parseClubMessageLifecycleList(data).find((message) => message.id === messageId) ?? null;
  } catch {
    return null;
  }
}

export async function saveClubMessageDraftAction(formData: FormData): Promise<MessageLifecycleActionResult> {
  const clubId = String(formData.get("clubId") ?? "").toLowerCase();
  const rawMessageId = String(formData.get("messageId") ?? "").toLowerCase();
  const messageId = rawMessageId === "" ? null : rawMessageId;
  if (!uuidPattern.test(clubId) || (messageId !== null && !uuidPattern.test(messageId))) {
    return { ok: false, reason: "invalid_input" };
  }

  let title: string;
  let body: string;
  try {
    title = normalizeMessageTitle(formData.get("title"));
    body = normalizeMessageBody(formData.get("body"));
  } catch {
    return { ok: false, reason: "invalid_input" };
  }
  const audience = audienceFrom(formData);
  if (!audience) return { ok: false, reason: "invalid_input" };

  const expiresAt = readOptionalIsoDate(formData.get("expiresAt"));
  const scheduledAt = readOptionalIsoDate(formData.get("scheduledAt"));
  const intent = formData.get("draftIntent");
  if (!expiresAt.ok || !scheduledAt.ok || (intent !== "save" && intent !== "schedule" && intent !== "publish")) {
    return { ok: false, reason: "invalid_input" };
  }
  if (intent !== "schedule" && scheduledAt.value !== null) return { ok: false, reason: "invalid_input" };
  if (intent === "schedule" && scheduledAt.value === null) return { ok: false, reason: "invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_club_message_draft", {
    p_club_id: clubId,
    p_message_id: messageId,
    p_title: title,
    p_body: body,
    p_tag_ids: audience.tagIds,
    p_membership_ids: audience.membershipIds,
    p_expires_at: expiresAt.value,
  });
  if (error || typeof data !== "object" || data === null || !("id" in data)) {
    return { ok: false, reason: failureReason(error) };
  }

  const savedMessageId = String((data as { id: unknown }).id).toLowerCase();
  if (!uuidPattern.test(savedMessageId)) return { ok: false, reason: "failed" };

  if (intent === "schedule") {
    const scheduled = await supabase.rpc("schedule_club_message", {
      p_club_id: clubId,
      p_message_id: savedMessageId,
      p_scheduled_at: scheduledAt.value,
    });
    if (scheduled.error) {
      return {
        ok: false,
        reason: "schedule_failed",
        persisted: await readLifecycleMessage(supabase, clubId, savedMessageId) ?? undefined,
      };
    }
  } else if (intent === "publish") {
    const published = await supabase.rpc("publish_club_message_draft_now", {
      p_club_id: clubId,
      p_message_id: savedMessageId,
    });
    if (published.error) {
      return {
        ok: false,
        reason: failureReason(published.error),
        persisted: await readLifecycleMessage(supabase, clubId, savedMessageId) ?? undefined,
      };
    }
  }

  const message = await readLifecycleMessage(supabase, clubId, savedMessageId);
  return message ? { ok: true, message } : { ok: false, reason: "failed" };
}

async function manageLifecycleMessage(
  rpcName: string,
  clubId: string,
  messageId: string,
  parameters: Record<string, unknown> = {},
): Promise<MessageLifecycleActionResult> {
  if (!uuidPattern.test(clubId) || !uuidPattern.test(messageId)) return { ok: false, reason: "invalid_input" };
  const normalizedClubId = clubId.toLowerCase();
  const normalizedMessageId = messageId.toLowerCase();
  const supabase = await createClient();
  const { error } = await supabase.rpc(rpcName as never, {
    p_club_id: normalizedClubId,
    p_message_id: normalizedMessageId,
    ...parameters,
  } as never);
  if (error) return { ok: false, reason: failureReason(error) };
  const message = await readLifecycleMessage(supabase, normalizedClubId, normalizedMessageId);
  return message ? { ok: true, message } : { ok: false, reason: "failed" };
}

export async function publishClubMessageDraftAction(clubId: string, messageId: string) {
  return manageLifecycleMessage("publish_club_message_draft_now", clubId, messageId);
}

export async function cancelScheduledClubMessageAction(clubId: string, messageId: string) {
  return manageLifecycleMessage("cancel_scheduled_club_message", clubId, messageId);
}

export async function setClubMessagePinnedAction(clubId: string, messageId: string, pinned: boolean) {
  return manageLifecycleMessage("set_club_message_pinned", clubId, messageId, { p_pinned: pinned });
}

export async function archiveClubMessageAction(clubId: string, messageId: string) {
  return manageLifecycleMessage("archive_club_message", clubId, messageId);
}

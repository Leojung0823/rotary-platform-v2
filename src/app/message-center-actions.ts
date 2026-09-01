"use server";

import { parseClubMessage, parseReadReceipt } from "@/lib/message-center/contracts";
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
  | { ok: true; message: ReturnType<typeof parseClubMessage> }
  | { ok: false; reason: "invalid_input" | "forbidden" | "failed" };

export type ReadActionResult =
  | { ok: true; readAt: string; unreadCount: number }
  | { ok: false; reason: "forbidden" | "failed" };

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

  try {
    const message = parseClubMessage({ ...(data as object), read_at: null });
    return { ok: true, message };
  } catch {
    return { ok: false, reason: "failed" };
  }
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

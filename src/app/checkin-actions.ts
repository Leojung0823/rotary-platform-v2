"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  parseCheckinDuration,
  parseCheckinReason,
  parseCheckinToken,
  parseCheckinUuid,
} from "@/lib/checkin/validation";
import { createClient } from "@/lib/supabase/server";

export type CheckinTokenActionState =
  | { status: "idle" }
  | { status: "success"; token: string; tokenPrefix: string; expiresAt: string; operation: "opened" | "rotated" }
  | { status: "error"; code: string };

function managementPath(clubId: string, eventId: string, key?: "success" | "error", code?: string) {
  const params = new URLSearchParams({ clubId });
  if (key && code) params.set(key, code);
  return `/events/${encodeURIComponent(eventId)}/checkin?${params.toString()}`;
}

function mapCheckinError(message: string | undefined) {
  if (message?.includes("attendance_manage_required")) return "forbidden";
  if (message?.includes("active_membership_required")) return "forbidden";
  if (message?.includes("event_not_checkin_eligible")) return "not_eligible";
  if (message?.includes("checkin_window_closed")) return "window_closed";
  if (message?.includes("checkin_session_already_active")) return "already_open";
  if (message?.includes("checkin_session_not_active")) return "not_open";
  if (message?.includes("checkin_token_invalid_or_expired")) return "invalid_token";
  if (message?.includes("invalid_checkin_token")) return "invalid_token";
  if (message?.includes("attendance_not_available")) return "not_found";
  if (message?.includes("invalid_checkin") || message?.includes("reason_required")) return "invalid_input";
  return "unexpected";
}

function parseTokenProjection(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const projection = value as Record<string, unknown>;
  if (
    typeof projection.token !== "string"
    || !/^[0-9a-f]{64}$/u.test(projection.token)
    || typeof projection.token_prefix !== "string"
    || projection.token_prefix.length !== 8
    || typeof projection.expires_at !== "string"
  ) return null;
  return {
    token: projection.token,
    tokenPrefix: projection.token_prefix,
    expiresAt: projection.expires_at,
  };
}

async function issueCheckinToken(
  operation: "opened" | "rotated",
  formData: FormData,
): Promise<CheckinTokenActionState> {
  let clubId: string;
  let eventId: string;
  let duration: number;
  try {
    clubId = parseCheckinUuid(formData.get("clubId"));
    eventId = parseCheckinUuid(formData.get("eventId"));
    duration = parseCheckinDuration(formData.get("duration"));
  } catch {
    return { status: "error", code: "invalid_input" };
  }

  const supabase = await createClient();
  const rpc = operation === "opened" ? "open_event_checkin" : "rotate_event_checkin_token";
  const { data, error } = await supabase.rpc(rpc, {
    p_club_id: clubId,
    p_event_id: eventId,
    p_duration_minutes: duration,
  });
  if (error) return { status: "error", code: mapCheckinError(error.message) };

  const token = parseTokenProjection(data);
  if (!token) return { status: "error", code: "unexpected" };
  revalidatePath(managementPath(clubId, eventId));
  return { status: "success", operation, ...token };
}

export async function openCheckinAction(
  _previousState: CheckinTokenActionState,
  formData: FormData,
): Promise<CheckinTokenActionState> {
  return issueCheckinToken("opened", formData);
}

export async function rotateCheckinTokenAction(
  _previousState: CheckinTokenActionState,
  formData: FormData,
): Promise<CheckinTokenActionState> {
  return issueCheckinToken("rotated", formData);
}

export async function closeCheckinAction(formData: FormData) {
  let clubId: string;
  let eventId: string;
  let reason: string;
  try {
    clubId = parseCheckinUuid(formData.get("clubId"));
    eventId = parseCheckinUuid(formData.get("eventId"));
    reason = parseCheckinReason(formData.get("reason"));
  } catch {
    redirect("/events?error=invalid_input");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("close_event_checkin", {
    p_club_id: clubId,
    p_event_id: eventId,
    p_reason: reason,
  });
  if (error) redirect(managementPath(clubId, eventId, "error", mapCheckinError(error.message)));
  revalidatePath(managementPath(clubId, eventId));
  redirect(managementPath(clubId, eventId, "success", "session_closed"));
}

export async function selfCheckinAction(formData: FormData) {
  let token: string;
  try {
    token = parseCheckinToken(formData.get("token"));
  } catch {
    redirect("/events/checkin?error=invalid_token");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_in_to_event", { p_token: token });
  if (error) redirect(`/events/checkin?error=${encodeURIComponent(mapCheckinError(error.message))}`);

  const projection = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null;
  const idempotent = projection && typeof projection.idempotent === "boolean" ? projection.idempotent : false;
  revalidatePath("/events");
  redirect(`/events/checkin?success=${idempotent ? "already_checked_in" : "checked_in"}`);
}

export async function manualCheckinAction(formData: FormData) {
  let clubId: string;
  let eventId: string;
  let membershipId: string;
  let reason: string;
  try {
    clubId = parseCheckinUuid(formData.get("clubId"));
    eventId = parseCheckinUuid(formData.get("eventId"));
    membershipId = parseCheckinUuid(formData.get("membershipId"));
    reason = parseCheckinReason(formData.get("reason"));
  } catch {
    redirect("/events?error=invalid_input");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("manual_check_in_event", {
    p_club_id: clubId,
    p_event_id: eventId,
    p_membership_id: membershipId,
    p_reason: reason,
  });
  if (error) redirect(managementPath(clubId, eventId, "error", mapCheckinError(error.message)));
  const projection = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null;
  const idempotent = projection && typeof projection.idempotent === "boolean" ? projection.idempotent : false;
  revalidatePath(managementPath(clubId, eventId));
  redirect(managementPath(clubId, eventId, "success", idempotent ? "already_checked_in" : "manual_checked_in"));
}

export async function revokeAttendanceAction(formData: FormData) {
  let clubId: string;
  let eventId: string;
  let attendanceId: string;
  let reason: string;
  try {
    clubId = parseCheckinUuid(formData.get("clubId"));
    eventId = parseCheckinUuid(formData.get("eventId"));
    attendanceId = parseCheckinUuid(formData.get("attendanceId"));
    reason = parseCheckinReason(formData.get("reason"));
  } catch {
    redirect("/events?error=invalid_input");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_event_attendance", {
    p_club_id: clubId,
    p_attendance_id: attendanceId,
    p_reason: reason,
  });
  if (error) redirect(managementPath(clubId, eventId, "error", mapCheckinError(error.message)));
  revalidatePath(managementPath(clubId, eventId));
  redirect(managementPath(clubId, eventId, "success", "attendance_revoked"));
}

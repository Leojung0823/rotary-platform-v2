"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  parseCheckinDuration,
  parseCheckinReason,
  parseCheckinToken,
  parseCheckinUuid,
} from "@/lib/checkin/validation";
import {
  mapCheckinSafeError,
  parseDynamicCheckinResult,
  parseDynamicCredentialProjection,
  type CheckinSafeErrorCode,
} from "@/lib/checkin/dynamic";
import { createClient } from "@/lib/supabase/server";

export type CheckinTokenActionState =
  | { status: "idle" }
  | { status: "success"; token: string; tokenPrefix: string; expiresAt: string; operation: "opened" | "rotated" }
  | { status: "error"; code: string };

export type DynamicQrActionState =
  | { status: "idle"; revision: number }
  | { status: "success"; revision: number; credential: string; credentialPrefix: string; expiresAt: string; serverNow: string; operation: "opened" | "automatic" | "emergency" }
  | { status: "error"; revision: number; code: CheckinSafeErrorCode };


export type DynamicSelfCheckinActionState =
  | { status: "idle" }
  | { status: "success"; result: "checked_in" | "already_checked_in" }
  | { status: "error"; code: CheckinSafeErrorCode };


export type CheckinReasonActionState =
  | { status: "idle"; revision: number; value: string }
  | { status: "success"; revision: number; value: "" }
  | { status: "error"; revision: number; value: string; code: CheckinSafeErrorCode };

export type ManualCheckinActionState =
  | { status: "idle"; revision: number; membershipId: string; reason: string }
  | { status: "success"; revision: number; membershipId: ""; reason: ""; result: "manual_checked_in" | "already_checked_in" }
  | { status: "error"; revision: number; membershipId: string; reason: string; code: CheckinSafeErrorCode };


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

async function parseManagementIds(formData: FormData) {
  return {
    clubId: parseCheckinUuid(formData.get("clubId")),
    eventId: parseCheckinUuid(formData.get("eventId")),
  };
}

async function issueDynamicCredential({
  previousState,
  formData,
  operation,
}: {
  previousState: DynamicQrActionState;
  formData: FormData;
  operation: "opened" | "automatic" | "emergency";
}): Promise<DynamicQrActionState> {
  let clubId: string;
  let eventId: string;
  try {
    ({ clubId, eventId } = await parseManagementIds(formData));
  } catch {
    return { status: "error", revision: previousState.revision + 1, code: "invalid_input" };
  }

  const supabase = await createClient();
  if (operation === "opened") {
    const { error } = await supabase.rpc("open_dynamic_event_checkin", {
      p_club_id: clubId,
      p_event_id: eventId,
    });
    if (error && !error.message.includes("checkin_session_already_active")) {
      return { status: "error", revision: previousState.revision + 1, code: mapCheckinSafeError(error.message) };
    }
  }

  const rotation = operation === "emergency" ? "emergency" : operation === "opened" ? "initial" : "automatic";
  const { data, error } = await supabase.rpc("issue_dynamic_event_checkin_credential", {
    p_club_id: clubId,
    p_event_id: eventId,
    p_rotation: rotation,
  });
  if (error) return { status: "error", revision: previousState.revision + 1, code: mapCheckinSafeError(error.message) };

  const credential = parseDynamicCredentialProjection(data);
  if (!credential) return { status: "error", revision: previousState.revision + 1, code: "temporary" };
  // The caller renders this credential entirely from action state. Revalidating
  // the current route here can replace that client state with the page loading
  // boundary before the new QR reaches the operator. The next navigation still
  // reads the session from the server, and mutations that change server-rendered
  // attendance data revalidate their routes separately.
  return { status: "success", revision: previousState.revision + 1, operation, ...credential };
}

export async function openDynamicCheckinAction(
  previousState: DynamicQrActionState,
  formData: FormData,
): Promise<DynamicQrActionState> {
  return issueDynamicCredential({ previousState, formData, operation: "opened" });
}

export async function refreshDynamicCheckinCredentialAction(
  previousState: DynamicQrActionState,
  formData: FormData,
): Promise<DynamicQrActionState> {
  const operation = formData.get("rotation") === "emergency" ? "emergency" : "automatic";
  return issueDynamicCredential({ previousState, formData, operation });
}

export async function selfDynamicCheckinAction(
  _previousState: DynamicSelfCheckinActionState,
  formData: FormData,
): Promise<DynamicSelfCheckinActionState> {
  let credential: string;
  try {
    credential = parseCheckinToken(formData.get("credential"));
  } catch {
    return { status: "error", code: "invalid_input" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_in_to_dynamic_event", { p_credential: credential });
  if (error) return { status: "error", code: mapCheckinSafeError(error.message) };

  const result = parseDynamicCheckinResult(data);
  if (!result) return { status: "error", code: "temporary" };
  revalidatePath("/events");
  return { status: "success", result: result.idempotent ? "already_checked_in" : "checked_in" };
}

export async function closeDynamicCheckinAction(
  previousState: CheckinReasonActionState,
  formData: FormData,
): Promise<CheckinReasonActionState> {
  const value = typeof formData.get("reason") === "string" ? String(formData.get("reason")) : "";
  let clubId: string;
  let eventId: string;
  let reason: string;
  try {
    ({ clubId, eventId } = await parseManagementIds(formData));
    reason = parseCheckinReason(formData.get("reason"));
  } catch {
    return { status: "error", revision: previousState.revision + 1, value, code: "invalid_input" };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_event_checkin", { p_club_id: clubId, p_event_id: eventId, p_reason: reason });
  if (error) return { status: "error", revision: previousState.revision + 1, value, code: mapCheckinSafeError(error.message) };
  revalidatePath(managementPath(clubId, eventId));
  return { status: "success", revision: previousState.revision + 1, value: "" };
}

export async function manualDynamicCheckinAction(
  previousState: ManualCheckinActionState,
  formData: FormData,
): Promise<ManualCheckinActionState> {
  const membershipIdValue = typeof formData.get("membershipId") === "string" ? String(formData.get("membershipId")) : "";
  const reasonValue = typeof formData.get("reason") === "string" ? String(formData.get("reason")) : "";
  let clubId: string;
  let eventId: string;
  let membershipId: string;
  let reason: string;
  try {
    ({ clubId, eventId } = await parseManagementIds(formData));
    membershipId = parseCheckinUuid(formData.get("membershipId"));
    reason = parseCheckinReason(formData.get("reason"));
  } catch {
    return { status: "error", revision: previousState.revision + 1, membershipId: membershipIdValue, reason: reasonValue, code: "invalid_input" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("manual_check_in_event", {
    p_club_id: clubId, p_event_id: eventId, p_membership_id: membershipId, p_reason: reason,
  });
  if (error) return { status: "error", revision: previousState.revision + 1, membershipId: membershipIdValue, reason: reasonValue, code: mapCheckinSafeError(error.message) };
  const result = parseDynamicCheckinResult(data);
  if (!result) return { status: "error", revision: previousState.revision + 1, membershipId: membershipIdValue, reason: reasonValue, code: "temporary" };
  revalidatePath(managementPath(clubId, eventId));
  return { status: "success", revision: previousState.revision + 1, membershipId: "", reason: "", result: result.idempotent ? "already_checked_in" : "manual_checked_in" };
}

export async function revokeDynamicAttendanceAction(
  previousState: CheckinReasonActionState,
  formData: FormData,
): Promise<CheckinReasonActionState> {
  const value = typeof formData.get("reason") === "string" ? String(formData.get("reason")) : "";
  let clubId: string;
  let eventId: string;
  let attendanceId: string;
  let reason: string;
  try {
    ({ clubId, eventId } = await parseManagementIds(formData));
    attendanceId = parseCheckinUuid(formData.get("attendanceId"));
    reason = parseCheckinReason(formData.get("reason"));
  } catch {
    return { status: "error", revision: previousState.revision + 1, value, code: "invalid_input" };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_event_attendance", { p_club_id: clubId, p_attendance_id: attendanceId, p_reason: reason });
  if (error) return { status: "error", revision: previousState.revision + 1, value, code: mapCheckinSafeError(error.message) };
  revalidatePath(managementPath(clubId, eventId));
  return { status: "success", revision: previousState.revision + 1, value: "" };
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

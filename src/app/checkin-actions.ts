"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseCheckinReason, parseCheckinToken, parseCheckinUuid } from "@/lib/checkin/validation";
import { parseTaipeiDateTime } from "@/lib/events/validation";
import { createClient } from "@/lib/supabase/server";

type CheckinFailureCode =
  | "accuracy_insufficient"
  | "already_checked_in"
  | "credential_expired"
  | "credential_invalid"
  | "location_invalid"
  | "not_eligible"
  | "outside_radius"
  | "rate_limited"
  | "session_closed"
  | "window_closed"
  | "unexpected";

export type QrPreviewResult =
  | { status: "ready"; eventId: string; title: string; location: string; startsAt: string; endsAt: string; expiresAt: string }
  | { status: "error"; code: CheckinFailureCode };

export type CheckinResult =
  | { status: "success"; attendanceId: string; idempotent: boolean }
  | { status: "error"; code: CheckinFailureCode; accuracyMeters?: number; requiredAccuracyMeters?: number; distanceMeters?: number; radiusMeters?: number };

export type DynamicQrResult =
  | { status: "success"; credential: string; expiresAt: string; rotationSeconds: number }
  | { status: "error"; code: string };

const clientFailureCodes = new Set([
  "location_permission_denied", "location_timeout", "location_unavailable",
  "camera_permission_denied", "camera_unsupported", "camera_error",
]);

function managementPath(clubId: string, eventId: string, key?: "success" | "error", code?: string) {
  const params = new URLSearchParams();
  if (key && code) params.set(key, code);
  const query = params.size ? `?${params.toString()}` : "";
  return `/clubs/${encodeURIComponent(clubId)}/attendance/${encodeURIComponent(eventId)}${query}`;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function checkinCode(value: unknown): CheckinFailureCode {
  const allowed: CheckinFailureCode[] = [
    "accuracy_insufficient", "already_checked_in", "credential_expired", "credential_invalid",
    "location_invalid", "not_eligible", "outside_radius", "rate_limited", "session_closed", "window_closed",
  ];
  return typeof value === "string" && allowed.includes(value as CheckinFailureCode) ? value as CheckinFailureCode : "unexpected";
}

function mapManagementError(message?: string) {
  if (message?.includes("attendance_manage_required")) return "forbidden";
  if (message?.includes("event_not_checkin_eligible")) return "not_eligible";
  if (message?.includes("checkin_window_closed")) return "window_closed";
  if (message?.includes("checkin_session_active")) return "session_active";
  if (message?.includes("checkin_session_not_active")) return "not_open";
  if (message?.includes("invalid_checkin_location")) return "invalid_location";
  if (message?.includes("invalid_checkin_window")) return "invalid_window";
  if (message?.includes("reason_required") || message?.includes("invalid_checkin")) return "invalid_input";
  if (message?.includes("attendance_not_available")) return "not_found";
  return "unexpected";
}

export async function previewQrCheckinAction(rawToken: string): Promise<QrPreviewResult> {
  let token: string;
  try {
    const formData = new FormData();
    formData.set("token", rawToken);
    token = parseCheckinToken(formData.get("token"));
  } catch {
    return { status: "error", code: "credential_invalid" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_event_qr_checkin", { p_token: token });
  if (error) return { status: "error", code: "unexpected" };
  const result = asRecord(data);
  if (!result || result.status !== "ready") return { status: "error", code: checkinCode(result?.status) };
  if (typeof result.event_id !== "string" || typeof result.title !== "string" || typeof result.location !== "string"
    || typeof result.starts_at !== "string" || typeof result.ends_at !== "string" || typeof result.credential_expires_at !== "string") {
    return { status: "error", code: "unexpected" };
  }
  return {
    status: "ready",
    eventId: result.event_id,
    title: result.title,
    location: result.location,
    startsAt: result.starts_at,
    endsAt: result.ends_at,
    expiresAt: result.credential_expires_at,
  };
}

export async function confirmQrCheckinAction(rawToken: string): Promise<CheckinResult> {
  let token: string;
  try {
    const formData = new FormData();
    formData.set("token", rawToken);
    token = parseCheckinToken(formData.get("token"));
  } catch {
    return { status: "error", code: "credential_invalid" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_event_qr_checkin", { p_token: token });
  if (error) return { status: "error", code: "unexpected" };
  const result = asRecord(data);
  if ((result?.status === "success" || result?.status === "already_checked_in") && typeof result.attendance_id === "string") {
    revalidatePath("/dashboard");
    revalidatePath("/events");
    return { status: "success", attendanceId: result.attendance_id, idempotent: result.status === "already_checked_in" || result.idempotent === true };
  }
  return { status: "error", code: checkinCode(result?.status) };
}

export async function gpsCheckinAction(input: {
  eventId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}): Promise<CheckinResult> {
  let eventId: string;
  try {
    const formData = new FormData();
    formData.set("eventId", input.eventId);
    eventId = parseCheckinUuid(formData.get("eventId"));
    if (![input.latitude, input.longitude, input.accuracyMeters].every(Number.isFinite)) throw new Error("invalid_location");
  } catch {
    return { status: "error", code: "location_invalid" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_in_by_gps", {
    p_event_id: eventId,
    p_latitude: input.latitude,
    p_longitude: input.longitude,
    p_accuracy_meters: input.accuracyMeters,
  });
  if (error) return { status: "error", code: "unexpected" };
  const result = asRecord(data);
  if ((result?.status === "success" || result?.status === "already_checked_in") && typeof result.attendance_id === "string") {
    revalidatePath("/dashboard");
    revalidatePath("/events");
    revalidatePath(`/events/${eventId}`);
    return { status: "success", attendanceId: result.attendance_id, idempotent: result.status === "already_checked_in" || result.idempotent === true };
  }
  return {
    status: "error",
    code: checkinCode(result?.status),
    accuracyMeters: typeof result?.accuracy_meters === "number" ? result.accuracy_meters : undefined,
    requiredAccuracyMeters: typeof result?.required_accuracy_meters === "number" ? result.required_accuracy_meters : undefined,
    distanceMeters: typeof result?.distance_meters === "number" ? result.distance_meters : undefined,
    radiusMeters: typeof result?.radius_meters === "number" ? result.radius_meters : undefined,
  };
}

export async function configureCheckinAction(formData: FormData) {
  let clubId: string;
  let eventId: string;
  try {
    clubId = parseCheckinUuid(formData.get("clubId"));
    eventId = parseCheckinUuid(formData.get("eventId"));
    const gpsEnabled = formData.get("gpsEnabled") === "on";
    const qrEnabled = formData.get("qrEnabled") === "on";
    const latitude = gpsEnabled ? Number(formData.get("latitude")) : null;
    const longitude = gpsEnabled ? Number(formData.get("longitude")) : null;
    const radius = gpsEnabled ? Number(formData.get("radiusMeters")) : null;
    const accuracy = gpsEnabled ? Number(formData.get("maxAccuracyMeters")) : null;
    const rotation = Number(formData.get("rotationSeconds"));
    const opensAt = String(formData.get("opensAt") ?? "");
    const closesAt = String(formData.get("closesAt") ?? "");
    if ((!gpsEnabled && !qrEnabled) || !opensAt || !closesAt || !Number.isInteger(rotation)) throw new Error("invalid");
    if (gpsEnabled && (![latitude, longitude, radius, accuracy].every((value) => typeof value === "number" && Number.isFinite(value)))) throw new Error("invalid");

    const supabase = await createClient();
    const { error } = await supabase.rpc("configure_event_checkin", {
      p_club_id: clubId,
      p_event_id: eventId,
      p_gps_enabled: gpsEnabled,
      p_qr_enabled: qrEnabled,
      p_latitude: latitude,
      p_longitude: longitude,
      p_radius_meters: radius,
      p_max_accuracy_meters: accuracy,
      p_opens_at: parseTaipeiDateTime(opensAt),
      p_closes_at: parseTaipeiDateTime(closesAt),
      p_qr_rotation_seconds: rotation,
    });
    if (error) redirect(managementPath(clubId, eventId, "error", mapManagementError(error.message)));
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    const rawClubId = String(formData.get("clubId") ?? "");
    const rawEventId = String(formData.get("eventId") ?? "");
    redirect(managementPath(rawClubId, rawEventId, "error", "invalid_input"));
  }
  revalidatePath(managementPath(clubId!, eventId!));
  redirect(managementPath(clubId!, eventId!, "success", "settings_saved"));
}

export async function startCheckinSessionAction(formData: FormData) {
  let clubId: string;
  let eventId: string;
  try {
    clubId = parseCheckinUuid(formData.get("clubId"));
    eventId = parseCheckinUuid(formData.get("eventId"));
  } catch {
    redirect("/dashboard");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_event_checkin_session", { p_club_id: clubId, p_event_id: eventId });
  if (error) redirect(managementPath(clubId, eventId, "error", mapManagementError(error.message)));
  revalidatePath(managementPath(clubId, eventId));
  redirect(managementPath(clubId, eventId, "success", "session_started"));
}

export async function issueDynamicQrAction(clubIdInput: string, eventIdInput: string): Promise<DynamicQrResult> {
  let clubId: string;
  let eventId: string;
  try {
    const formData = new FormData();
    formData.set("clubId", clubIdInput);
    formData.set("eventId", eventIdInput);
    clubId = parseCheckinUuid(formData.get("clubId"));
    eventId = parseCheckinUuid(formData.get("eventId"));
  } catch {
    return { status: "error", code: "invalid_input" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_event_checkin_qr", { p_club_id: clubId, p_event_id: eventId });
  if (error) return { status: "error", code: mapManagementError(error.message) };
  const result = asRecord(data);
  if (!result || typeof result.token !== "string" || typeof result.expires_at !== "string" || typeof result.rotation_seconds !== "number") {
    return { status: "error", code: "unexpected" };
  }
  return { status: "success", credential: result.token, expiresAt: result.expires_at, rotationSeconds: result.rotation_seconds };
}

export async function recordClientCheckinFailureAction(eventIdInput: string, method: "gps" | "qr", code: string) {
  if (!clientFailureCodes.has(code)) return;
  let eventId: string;
  try { eventId = parseCheckinUuid(eventIdInput); } catch { return; }
  const supabase = await createClient();
  await supabase.rpc("record_client_checkin_failure", { p_event_id: eventId, p_method: method, p_result_code: code });
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
    redirect("/dashboard");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_event_checkin", { p_club_id: clubId, p_event_id: eventId, p_reason: reason });
  if (error) redirect(managementPath(clubId, eventId, "error", mapManagementError(error.message)));
  revalidatePath(managementPath(clubId, eventId));
  revalidatePath("/dashboard");
  redirect(managementPath(clubId, eventId, "success", "session_closed"));
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
    redirect("/dashboard");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("manual_check_in_event", {
    p_club_id: clubId, p_event_id: eventId, p_membership_id: membershipId, p_reason: reason,
  });
  if (error) redirect(managementPath(clubId, eventId, "error", mapManagementError(error.message)));
  const result = asRecord(data);
  revalidatePath(managementPath(clubId, eventId));
  revalidatePath("/dashboard");
  redirect(managementPath(clubId, eventId, "success", result?.status === "already_checked_in" ? "already_checked_in" : "manual_checked_in"));
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
    redirect("/dashboard");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_event_attendance", { p_club_id: clubId, p_attendance_id: attendanceId, p_reason: reason });
  if (error) redirect(managementPath(clubId, eventId, "error", mapManagementError(error.message)));
  revalidatePath(managementPath(clubId, eventId));
  revalidatePath("/dashboard");
  redirect(managementPath(clubId, eventId, "success", "attendance_revoked"));
}

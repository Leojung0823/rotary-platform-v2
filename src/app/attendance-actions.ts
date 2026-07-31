"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  parseAttendanceAdjustmentType,
  parseAttendanceReason,
  parseAttendanceUuid,
} from "@/lib/attendance/validation";
import { createClient } from "@/lib/supabase/server";

function managementPath(clubId: string, eventId: string, key: "success" | "error", code: string) {
  const query = new URLSearchParams({ clubId, eventId, [key]: code });
  return `/attendance/manage?${query.toString()}`;
}

function mapAttendanceError(message: string | undefined) {
  if (message?.includes("attendance_manage_required") || message?.includes("membership_not_attendance_eligible")) return "forbidden";
  if (message?.includes("active_attendance_adjustment_exists")) return "adjustment_exists";
  if (message?.includes("event_not_attendance_eligible")) return "event_not_eligible";
  if (message?.includes("attendance_adjustment_not_available")) return "not_found";
  if (message?.includes("invalid_attendance") || message?.includes("revocation_required")) return "invalid_input";
  return "unexpected";
}

export async function setAttendanceAdjustmentAction(formData: FormData) {
  let clubId: string;
  let eventId: string;
  let membershipId: string;
  let type: ReturnType<typeof parseAttendanceAdjustmentType>;
  let reason: string;
  try {
    clubId = parseAttendanceUuid(formData.get("clubId"));
    eventId = parseAttendanceUuid(formData.get("eventId"));
    membershipId = parseAttendanceUuid(formData.get("membershipId"));
    type = parseAttendanceAdjustmentType(formData.get("type"));
    reason = parseAttendanceReason(formData.get("reason"));
  } catch {
    redirect("/attendance/manage?error=invalid_input");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_attendance_adjustment", {
    p_club_id: clubId,
    p_event_id: eventId,
    p_membership_id: membershipId,
    p_type: type,
    p_reason: reason,
  });
  if (error) redirect(managementPath(clubId, eventId, "error", mapAttendanceError(error.message)));
  revalidatePath("/attendance");
  revalidatePath("/attendance/manage");
  revalidatePath("/dashboard");
  redirect(managementPath(clubId, eventId, "success", "adjustment_set"));
}

export async function revokeAttendanceAdjustmentAction(formData: FormData) {
  let clubId: string;
  let eventId: string;
  let adjustmentId: string;
  let reason: string;
  try {
    clubId = parseAttendanceUuid(formData.get("clubId"));
    eventId = parseAttendanceUuid(formData.get("eventId"));
    adjustmentId = parseAttendanceUuid(formData.get("adjustmentId"));
    reason = parseAttendanceReason(formData.get("reason"));
  } catch {
    redirect("/attendance/manage?error=invalid_input");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_attendance_adjustment", {
    p_club_id: clubId,
    p_adjustment_id: adjustmentId,
    p_reason: reason,
  });
  if (error) redirect(managementPath(clubId, eventId, "error", mapAttendanceError(error.message)));
  revalidatePath("/attendance");
  revalidatePath("/attendance/manage");
  revalidatePath("/dashboard");
  redirect(managementPath(clubId, eventId, "success", "adjustment_revoked"));
}

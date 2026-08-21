"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  parseAdjustmentReason,
  parseAdjustmentType,
  parseAttendanceUuid,
} from "@/lib/attendance/validation";
import { createClient } from "@/lib/supabase/server";

function managePath(
  clubId: string,
  eventId: string | null,
  key: "success" | "error",
  code: string,
) {
  const params = new URLSearchParams({ clubId, [key]: code });
  if (eventId) params.set("eventId", eventId);
  return `/attendance/manage?${params.toString()}`;
}

function mapAttendanceError(message: string | undefined) {
  if (message?.includes("attendance_manage_required")) return "forbidden";
  if (message?.includes("active_attendance_membership_required")) return "forbidden";
  if (message?.includes("membership_not_attendance_eligible")) return "member_not_eligible";
  if (message?.includes("event_not_attendance_eligible")) return "event_not_eligible";
  if (message?.includes("active_attendance_adjustment_exists")) return "already_adjusted";
  if (message?.includes("attendance_adjustment_not_available")) return "adjustment_missing";
  if (message?.includes("attendance_adjustment_revocation_required")) return "invalid_input";
  if (message?.includes("invalid_attendance")) return "invalid_input";
  return "unexpected";
}

export async function setAttendanceAdjustmentAction(formData: FormData) {
  let clubId: string;
  let eventId: string | null = null;
  try {
    clubId = parseAttendanceUuid(formData.get("clubId"));
  } catch {
    redirect("/attendance/manage?error=invalid_input");
  }

  let target: { eventId: string; membershipId: string; type: string; reason: string };
  try {
    target = {
      eventId: parseAttendanceUuid(formData.get("eventId")),
      membershipId: parseAttendanceUuid(formData.get("membershipId")),
      type: parseAdjustmentType(formData.get("adjustmentType")),
      reason: parseAdjustmentReason(formData.get("reason")),
    };
    eventId = target.eventId;
  } catch {
    redirect(managePath(clubId, eventId, "error", "invalid_input"));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_attendance_adjustment", {
    p_club_id: clubId,
    p_event_id: target.eventId,
    p_membership_id: target.membershipId,
    p_type: target.type,
    p_reason: target.reason,
  });
  if (error) {
    redirect(managePath(clubId, target.eventId, "error", mapAttendanceError(error.message)));
  }

  revalidatePath("/attendance/manage");
  revalidatePath("/attendance");
  redirect(managePath(clubId, target.eventId, "success", "adjustment_saved"));
}

export async function revokeAttendanceAdjustmentAction(formData: FormData) {
  let clubId: string;
  let eventId: string | null = null;
  try {
    clubId = parseAttendanceUuid(formData.get("clubId"));
  } catch {
    redirect("/attendance/manage?error=invalid_input");
  }

  let target: { adjustmentId: string; reason: string };
  try {
    eventId = parseAttendanceUuid(formData.get("eventId"));
    target = {
      adjustmentId: parseAttendanceUuid(formData.get("adjustmentId")),
      reason: parseAdjustmentReason(formData.get("revocationReason")),
    };
  } catch {
    redirect(managePath(clubId, eventId, "error", "invalid_input"));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_attendance_adjustment", {
    p_club_id: clubId,
    p_adjustment_id: target.adjustmentId,
    p_reason: target.reason,
  });
  if (error) {
    redirect(managePath(clubId, eventId, "error", mapAttendanceError(error.message)));
  }

  revalidatePath("/attendance/manage");
  revalidatePath("/attendance");
  redirect(managePath(clubId, eventId, "success", "adjustment_revoked"));
}

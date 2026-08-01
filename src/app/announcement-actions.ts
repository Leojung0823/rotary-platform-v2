"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  parseAnnouncementAudiences,
  parseAnnouncementBody,
  parseAnnouncementTitle,
  parseAnnouncementUuid,
  parseOptionalAnnouncementTime,
  requireConfirmed,
  validateAnnouncementTimes,
} from "@/lib/announcements/validation";
import { createClient } from "@/lib/supabase/server";
import { requireIdentity } from "@/lib/auth";
import { isSameOriginMutation } from "@/lib/message-board/validation";

async function requireAnnouncementMutation() {
  await requireIdentity();
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const requestOrigin = host ? `${protocol}://${host}` : "";
  if (!isSameOriginMutation({
    requestOrigin,
    origin: requestHeaders.get("origin"),
    fetchSite: requestHeaders.get("sec-fetch-site"),
    configuredSiteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  })) {
    redirect("/announcements?error=invalid_request");
  }
}

function resultPath(path: string, key: "success" | "error", value: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${new URLSearchParams({ [key]: value })}`;
}

function genericError(message: string | undefined) {
  if (message?.includes("manage_denied") || message?.includes("access_denied")) return "access_denied";
  if (message?.includes("not_available") || message?.includes("not_editable")) return "not_available";
  if (message?.includes("transition_denied")) return "transition_denied";
  return "invalid_request";
}

export async function createAnnouncementAction(formData: FormData) {
  await requireAnnouncementMutation();
  let clubId: string; let title: string; let body: string; let audiences; let expireAt; let pinnedUntil;
  try {
    clubId = parseAnnouncementUuid(formData.get("clubId"));
    title = parseAnnouncementTitle(formData.get("title"));
    body = parseAnnouncementBody(formData.get("body"));
    audiences = parseAnnouncementAudiences(formData);
    expireAt = parseOptionalAnnouncementTime(formData.get("expireAt"));
    pinnedUntil = parseOptionalAnnouncementTime(formData.get("pinnedUntil"));
    validateAnnouncementTimes(null, expireAt, pinnedUntil);
  } catch { redirect("/announcements/manage/new?error=invalid_request"); }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_club_announcement", {
    p_club_id: clubId!, p_title: title!, p_body: body!, p_audiences: audiences!,
    p_expire_at: expireAt!, p_pinned_until: pinnedUntil!,
  });
  if (error) redirect(`/announcements/manage/new?clubId=${clubId!}&error=${genericError(error.message)}`);
  revalidatePath("/announcements/manage");
  redirect(`/announcements/manage/${data}?clubId=${clubId!}&success=created`);
}

export async function updateAnnouncementAction(formData: FormData) {
  await requireAnnouncementMutation();
  let clubId: string; let announcementId: string; let title: string; let body: string; let audiences; let publishAt; let expireAt; let pinnedUntil;
  try {
    clubId = parseAnnouncementUuid(formData.get("clubId"));
    announcementId = parseAnnouncementUuid(formData.get("announcementId"));
    title = parseAnnouncementTitle(formData.get("title"));
    body = parseAnnouncementBody(formData.get("body"));
    audiences = parseAnnouncementAudiences(formData);
    publishAt = parseOptionalAnnouncementTime(formData.get("publishAt"));
    expireAt = parseOptionalAnnouncementTime(formData.get("expireAt"));
    pinnedUntil = parseOptionalAnnouncementTime(formData.get("pinnedUntil"));
    validateAnnouncementTimes(publishAt, expireAt, pinnedUntil);
  } catch { redirect("/announcements/manage?error=invalid_request"); }
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_draft_announcement", {
    p_club_id: clubId!, p_announcement_id: announcementId!, p_title: title!, p_body: body!,
    p_audiences: audiences!, p_publish_at: publishAt!, p_expire_at: expireAt!, p_pinned_until: pinnedUntil!,
  });
  const path = `/announcements/manage/${announcementId!}`;
  if (error) redirect(resultPath(path, "error", genericError(error.message)));
  revalidatePath(path); revalidatePath("/announcements/manage");
  redirect(resultPath(path, "success", "updated"));
}

async function confirmedIds(formData: FormData) {
  requireConfirmed(formData.get("confirmation"));
  return {
    clubId: parseAnnouncementUuid(formData.get("clubId")),
    announcementId: parseAnnouncementUuid(formData.get("announcementId")),
  };
}

export async function scheduleAnnouncementAction(formData: FormData) {
  await requireAnnouncementMutation();
  let ids; let publishAt;
  try {
    ids = await confirmedIds(formData);
    publishAt = parseOptionalAnnouncementTime(formData.get("publishAt"));
    if (!publishAt) throw new Error("invalid");
    validateAnnouncementTimes(publishAt, null, null);
  } catch { redirect("/announcements/manage?error=confirmation_required"); }
  const supabase = await createClient();
  const { error } = await supabase.rpc("schedule_club_announcement", {
    p_club_id: ids!.clubId, p_announcement_id: ids!.announcementId, p_publish_at: publishAt!,
  });
  const path = `/announcements/manage/${ids!.announcementId}`;
  if (error) redirect(resultPath(path, "error", genericError(error.message)));
  revalidatePath(path); revalidatePath("/announcements/manage");
  redirect(resultPath(path, "success", "scheduled"));
}

export async function publishAnnouncementAction(formData: FormData) {
  await requireAnnouncementMutation();
  let ids;
  try { ids = await confirmedIds(formData); } catch { redirect("/announcements/manage?error=confirmation_required"); }
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_club_announcement", {
    p_club_id: ids!.clubId, p_announcement_id: ids!.announcementId,
  });
  const path = `/announcements/manage/${ids!.announcementId}`;
  if (error) redirect(resultPath(path, "error", genericError(error.message)));
  revalidatePath("/announcements"); revalidatePath("/notifications"); revalidatePath("/dashboard");
  redirect(resultPath(path, "success", "published"));
}

export async function cancelAnnouncementAction(formData: FormData) {
  await requireAnnouncementMutation();
  let ids; let reason;
  try {
    ids = await confirmedIds(formData);
    reason = typeof formData.get("reason") === "string" ? String(formData.get("reason")).trim() : "";
    if (!reason || reason.length > 500) throw new Error("invalid");
  } catch { redirect("/announcements/manage?error=confirmation_required"); }
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_club_announcement", {
    p_club_id: ids!.clubId, p_announcement_id: ids!.announcementId, p_reason: reason!,
  });
  const path = `/announcements/manage/${ids!.announcementId}`;
  if (error) redirect(resultPath(path, "error", genericError(error.message)));
  revalidatePath("/announcements"); revalidatePath("/notifications");
  redirect(resultPath(path, "success", "cancelled"));
}

export async function archiveAnnouncementAction(formData: FormData) {
  await requireAnnouncementMutation();
  let ids;
  try { ids = await confirmedIds(formData); } catch { redirect("/announcements/manage?error=confirmation_required"); }
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_club_announcement", {
    p_club_id: ids!.clubId, p_announcement_id: ids!.announcementId,
  });
  const path = `/announcements/manage/${ids!.announcementId}`;
  if (error) redirect(resultPath(path, "error", genericError(error.message)));
  revalidatePath("/announcements/manage");
  redirect(resultPath(path, "success", "archived"));
}

export async function retryAnnouncementDeliveriesAction(formData: FormData) {
  await requireAnnouncementMutation();
  let ids;
  try { ids = await confirmedIds(formData); } catch { redirect("/announcements/manage?error=confirmation_required"); }
  const supabase = await createClient();
  const { error } = await supabase.rpc("retry_failed_announcement_deliveries", {
    p_club_id: ids!.clubId, p_announcement_id: ids!.announcementId,
  });
  const path = `/announcements/manage/${ids!.announcementId}`;
  if (error) redirect(resultPath(path, "error", genericError(error.message)));
  revalidatePath(path);
  redirect(resultPath(path, "success", "retry_queued"));
}

export async function markAnnouncementReadAction(formData: FormData) {
  await requireAnnouncementMutation();
  let clubId; let announcementId;
  try {
    clubId = parseAnnouncementUuid(formData.get("clubId"));
    announcementId = parseAnnouncementUuid(formData.get("announcementId"));
  } catch { redirect("/announcements?error=invalid_request"); }
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_announcement_read", {
    p_club_id: clubId!, p_announcement_id: announcementId!,
  });
  if (error) redirect("/announcements?error=access_denied");
  revalidatePath(`/announcements/${announcementId!}`); revalidatePath("/announcements");
  redirect(`/announcements/${announcementId!}?clubId=${clubId!}&success=read`);
}

export async function markNotificationReadAction(formData: FormData) {
  await requireAnnouncementMutation();
  let notificationId;
  try { notificationId = parseAnnouncementUuid(formData.get("notificationId")); }
  catch { redirect("/notifications?error=invalid_request"); }
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notification_read", { p_notification_id: notificationId! });
  if (error) redirect("/notifications?error=access_denied");
  revalidatePath("/notifications"); revalidatePath("/dashboard");
  redirect("/notifications?success=read");
}

export async function markAllNotificationsReadAction(formData: FormData) {
  await requireAnnouncementMutation();
  try { requireConfirmed(formData.get("confirmation")); }
  catch { redirect("/notifications?error=confirmation_required"); }
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_all_notifications_read");
  if (error) redirect("/notifications?error=access_denied");
  revalidatePath("/notifications"); revalidatePath("/dashboard");
  redirect("/notifications?success=all_read");
}

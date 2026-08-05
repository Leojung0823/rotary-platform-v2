"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseCheckinUuid } from "@/lib/checkin/validation";
import { parseTaipeiDateTime } from "@/lib/events/validation";
import { createClient } from "@/lib/supabase/server";

function text(value: FormDataEntryValue | null, max: number, required = false) {
  const parsed = typeof value === "string" ? value.trim() : "";
  if ((required && !parsed) || parsed.length > max) throw new Error("invalid_text");
  return parsed;
}

function path(clubId: string, key: "success" | "error", code: string) {
  return `/clubs/${encodeURIComponent(clubId)}/announcements?${new URLSearchParams({ [key]: code }).toString()}`;
}

export async function saveAnnouncementAction(formData: FormData) {
  let clubId: string;
  try {
    clubId = parseCheckinUuid(formData.get("clubId"));
    const rawId = text(formData.get("announcementId"), 36);
    const expires = text(formData.get("expiresAt"), 30);
    const supabase = await createClient();
    const { error } = await supabase.rpc("save_club_announcement", {
      p_club_id: clubId,
      p_announcement_id: rawId ? parseCheckinUuid(rawId) : null,
      p_title: text(formData.get("title"), 160, true),
      p_body: text(formData.get("body"), 5000, true),
      p_pinned: formData.get("pinned") === "on",
      p_requires_acknowledgement: formData.get("requiresAcknowledgement") === "on",
      p_expires_at: expires ? parseTaipeiDateTime(expires) : null,
    });
    if (error) redirect(path(clubId, "error", error.message.includes("required") ? "forbidden" : "invalid_input"));
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect("/dashboard");
  }
  revalidatePath("/dashboard");
  revalidatePath(`/clubs/${clubId!}/announcements`);
  redirect(path(clubId!, "success", "saved"));
}

export async function publishAnnouncementAction(formData: FormData) {
  let clubId: string;
  let announcementId: string;
  try { clubId = parseCheckinUuid(formData.get("clubId")); announcementId = parseCheckinUuid(formData.get("announcementId")); }
  catch { redirect("/dashboard"); }
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_club_announcement", { p_club_id: clubId, p_announcement_id: announcementId });
  if (error) redirect(path(clubId, "error", "unexpected"));
  revalidatePath("/dashboard"); revalidatePath(`/clubs/${clubId}/announcements`);
  redirect(path(clubId, "success", "published"));
}

export async function archiveAnnouncementAction(formData: FormData) {
  let clubId: string;
  let announcementId: string;
  let reason: string;
  try { clubId = parseCheckinUuid(formData.get("clubId")); announcementId = parseCheckinUuid(formData.get("announcementId")); reason = text(formData.get("reason"), 500, true); }
  catch { redirect("/dashboard"); }
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_club_announcement", { p_club_id: clubId, p_announcement_id: announcementId, p_reason: reason });
  if (error) redirect(path(clubId, "error", "unexpected"));
  revalidatePath("/dashboard"); revalidatePath(`/clubs/${clubId}/announcements`);
  redirect(path(clubId, "success", "archived"));
}

export async function acknowledgeAnnouncementAction(formData: FormData) {
  let clubId: string;
  let announcementId: string;
  try { clubId = parseCheckinUuid(formData.get("clubId")); announcementId = parseCheckinUuid(formData.get("announcementId")); }
  catch { redirect("/dashboard"); }
  const supabase = await createClient();
  const { error } = await supabase.rpc("acknowledge_club_announcement", { p_announcement_id: announcementId });
  if (error) redirect(`/announcements?clubId=${encodeURIComponent(clubId)}&error=unexpected`);
  revalidatePath("/dashboard"); revalidatePath("/announcements");
  redirect(`/announcements?clubId=${encodeURIComponent(clubId)}&success=acknowledged#announcement-${announcementId}`);
}

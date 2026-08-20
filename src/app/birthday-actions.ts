"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function birthdayPath(clubId: string, kind?: "success" | "error", code?: string) {
  const query = new URLSearchParams({ clubId });
  if (kind && code) query.set(kind, code);
  return `/birthdays?${query.toString()}`;
}

function requiredUuid(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim().toLowerCase();
  if (!uuidPattern.test(value)) throw new Error("invalid_input");
  return value;
}

function wishContent(formData: FormData) {
  const content = String(formData.get("content") ?? "").replace(/\s+/gu, " ").trim();
  if (content.length < 1 || content.length > 500) throw new Error("invalid_content");
  return content;
}

function errorCode(message: string) {
  if (message.includes("already_exists") || message.includes("23505")) return "already_wished";
  if (message.includes("birth_date_required")) return "birth_date_required";
  if (message.includes("not_accepting")) return "not_accepting";
  if (message.includes("required") || message.includes("42501")) return "forbidden";
  return "unexpected";
}

export async function setBirthdayPreferenceAction(formData: FormData) {
  let clubId: string;
  try {
    clubId = requiredUuid(formData, "clubId");
  } catch {
    redirect("/birthdays?error=invalid_input");
  }

  const isListed = formData.get("isListed") === "on";
  const allowWishes = isListed && formData.get("allowWishes") === "on";
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_birthday_preference", {
    p_club_id: clubId,
    p_is_listed: isListed,
    p_allow_wishes: allowWishes,
  });
  if (error) redirect(birthdayPath(clubId, "error", errorCode(error.message)));
  redirect(birthdayPath(clubId, "success", "preference_saved"));
}

export async function createBirthdayWishAction(formData: FormData) {
  let clubId: string;
  let recipientMembershipId: string;
  let content: string;
  try {
    clubId = requiredUuid(formData, "clubId");
    recipientMembershipId = requiredUuid(formData, "recipientMembershipId");
    content = wishContent(formData);
  } catch {
    redirect("/birthdays?error=invalid_input");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_birthday_wish", {
    p_club_id: clubId,
    p_recipient_membership_id: recipientMembershipId,
    p_content: content,
  });
  if (error) redirect(birthdayPath(clubId, "error", errorCode(error.message)));
  redirect(birthdayPath(clubId, "success", "wish_created"));
}

export async function updateBirthdayWishAction(formData: FormData) {
  let clubId: string;
  let wishId: string;
  let content: string;
  try {
    clubId = requiredUuid(formData, "clubId");
    wishId = requiredUuid(formData, "wishId");
    content = wishContent(formData);
  } catch {
    redirect("/birthdays?error=invalid_input");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_own_birthday_wish", {
    p_club_id: clubId,
    p_wish_id: wishId,
    p_content: content,
  });
  if (error) redirect(birthdayPath(clubId, "error", errorCode(error.message)));
  redirect(birthdayPath(clubId, "success", "wish_updated"));
}

export async function deleteBirthdayWishAction(formData: FormData) {
  let clubId: string;
  let wishId: string;
  try {
    clubId = requiredUuid(formData, "clubId");
    wishId = requiredUuid(formData, "wishId");
  } catch {
    redirect("/birthdays?error=invalid_input");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_own_birthday_wish", {
    p_club_id: clubId,
    p_wish_id: wishId,
  });
  if (error) redirect(birthdayPath(clubId, "error", errorCode(error.message)));
  redirect(birthdayPath(clubId, "success", "wish_deleted"));
}

export async function hideBirthdayWishAction(formData: FormData) {
  let clubId: string;
  let wishId: string;
  let reason: string;
  try {
    clubId = requiredUuid(formData, "clubId");
    wishId = requiredUuid(formData, "wishId");
    reason = String(formData.get("reason") ?? "").trim();
    if (reason.length < 2 || reason.length > 300) throw new Error("invalid_reason");
  } catch {
    redirect("/birthdays?error=invalid_input");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("hide_birthday_wish", {
    p_club_id: clubId,
    p_wish_id: wishId,
    p_reason: reason,
  });
  if (error) redirect(birthdayPath(clubId, "error", errorCode(error.message)));
  redirect(birthdayPath(clubId, "success", "wish_hidden"));
}

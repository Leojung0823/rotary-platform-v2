"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function parseUuid(value: FormDataEntryValue | null) {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (!uuidPattern.test(parsed)) throw new Error("invalid_input");
  return parsed;
}

/** Checkbox groups arrive as repeated entries; anything malformed is rejected. */
function parseUuidList(formData: FormData, name: string) {
  const values = formData.getAll(name).map((value) => String(value).trim());
  if (values.some((value) => !uuidPattern.test(value))) throw new Error("invalid_input");
  return Array.from(new Set(values));
}

function membersPath(clubId: string, key: "success" | "error", code: string) {
  return `/clubs/${encodeURIComponent(clubId)}/members?${key}=${encodeURIComponent(code)}`;
}

function memberPath(clubId: string, membershipId: string, key: "success" | "error", code: string) {
  return `/clubs/${encodeURIComponent(clubId)}/members/${encodeURIComponent(membershipId)}`
    + `?${key}=${encodeURIComponent(code)}`;
}

function tagErrorCode(message: string | undefined) {
  if (message?.includes("member_tag_already_exists")) return "tag_exists";
  if (message?.includes("member_manage_required")) return "forbidden";
  if (message?.includes("invalid_member_tag")) return "invalid_input";
  if (message?.includes("member_tag_not_available")) return "tag_missing";
  return "unexpected";
}

export async function createMemberTagAction(formData: FormData) {
  let clubId: string;
  try {
    clubId = parseUuid(formData.get("clubId"));
  } catch {
    redirect("/dashboard");
  }

  const name = String(formData.get("tagName") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!name || name.length > 40 || description.length > 200) {
    redirect(membersPath(clubId, "error", "invalid_input"));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_club_member_tag", {
    p_club_id: clubId,
    p_tag_name: name,
    p_description: description || null,
  });
  if (error) redirect(membersPath(clubId, "error", tagErrorCode(error.message)));

  revalidatePath(`/clubs/${clubId}/members`);
  redirect(membersPath(clubId, "success", "tag_created"));
}

export async function archiveMemberTagAction(formData: FormData) {
  let clubId: string;
  let tagId: string;
  try {
    clubId = parseUuid(formData.get("clubId"));
    tagId = parseUuid(formData.get("tagId"));
  } catch {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_club_member_tag", {
    p_club_id: clubId,
    p_tag_id: tagId,
  });
  if (error) redirect(membersPath(clubId, "error", tagErrorCode(error.message)));

  revalidatePath(`/clubs/${clubId}/members`);
  redirect(membersPath(clubId, "success", "tag_archived"));
}

export async function setMembershipTagsAction(formData: FormData) {
  let clubId: string;
  let membershipId: string;
  let tagIds: string[];
  try {
    clubId = parseUuid(formData.get("clubId"));
    membershipId = parseUuid(formData.get("membershipId"));
    tagIds = parseUuidList(formData, "tagIds");
  } catch {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  // The whole set is sent every time rather than a diff: the form already
  // holds the complete intended state, and replacing it means two officers
  // editing at once cannot merge into a combination neither of them chose.
  const { error } = await supabase.rpc("set_membership_tags", {
    p_club_id: clubId,
    p_membership_id: membershipId,
    p_tag_ids: tagIds,
  });
  if (error) redirect(memberPath(clubId, membershipId, "error", tagErrorCode(error.message)));

  revalidatePath(`/clubs/${clubId}/members/${membershipId}`);
  redirect(memberPath(clubId, membershipId, "success", "tags_saved"));
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireIdentity } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  parseDiscussionAudienceKind, parseDiscussionOptions, parseDiscussionUuid,
  parseTaipeiDateTimeLocal, readDiscussionUuidList,
} from "@/lib/discussion-topics/validation";

function formString(formData: FormData, name: string, maximum: number) {
  const value = formData.get(name);
  if (typeof value !== "string" || value.length > maximum) throw new Error("invalid_input");
  return value;
}
function managementPath(clubId: string, result: "success" | "error", value: string) {
  return "/clubs/" + encodeURIComponent(clubId) + "/topics?mode=management&" + result + "=" + encodeURIComponent(value);
}
function memberPath(clubId: string, topicId: string, result: "success" | "error", value: string) {
  return "/topics/" + encodeURIComponent(topicId) + "?clubId=" + encodeURIComponent(clubId)
    + "&mode=member&" + result + "=" + encodeURIComponent(value);
}
function mapFailure(error: { code?: string | null; message?: string | null } | null) {
  if (error?.code === "42501" || error?.message?.includes("discussion_manage_required")) return "forbidden";
  if (error?.code === "P0002") return "closed";
  if (error?.code === "22023") return "invalid_input";
  return "unexpected";
}

export async function publishDiscussionTopicAction(formData: FormData) {
  const clubId = parseDiscussionUuid(formString(formData, "clubId", 64), "invalid_club_id");
  try {
    await requireIdentity();
    const title = formString(formData, "title", 121).trim();
    const description = formString(formData, "description", 5001).trim();
    const deadlineAt = parseTaipeiDateTimeLocal(formString(formData, "deadlineAt", 32));
    const selectedMode = formData.get("audienceMode");
    const audienceKind = selectedMode === "everyone" ? "all"
      : selectedMode === "members" ? "people"
        : parseDiscussionAudienceKind(selectedMode);
    const tagIds = readDiscussionUuidList(formData, "audienceTagIds", 20);
    const membershipIds = readDiscussionUuidList(formData, "audienceMembershipIds", 100);
    const optionLabels = parseDiscussionOptions(formString(formData, "options", 1000));
    const voteMode = formData.get("voteMode");
    if (voteMode !== "anonymous" && voteMode !== "named") throw new Error("invalid_input");

    const supabase = await createClient();
    const { error } = await supabase.rpc("create_club_discussion_topic", {
      p_club_id: clubId, p_title: title, p_description: description, p_deadline_at: deadlineAt,
      p_audience_kind: audienceKind,
      p_tag_ids: audienceKind === "tags" ? tagIds : [],
      p_membership_ids: audienceKind === "people" ? membershipIds : [],
      p_anonymous_votes: voteMode === "anonymous", p_options: optionLabels,
    });
    if (error) redirect(managementPath(clubId, "error", mapFailure(error)));
    revalidatePath("/topics");
    revalidatePath("/dashboard");
    revalidatePath("/clubs/" + clubId + "/topics");
    redirect(managementPath(clubId, "success", "published"));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT")) throw error;
    redirect(managementPath(clubId, "error", "invalid_input"));
  }
}

export async function addDiscussionCommentAction(formData: FormData) {
  const clubId = parseDiscussionUuid(formString(formData, "clubId", 64), "invalid_club_id");
  const topicId = parseDiscussionUuid(formString(formData, "topicId", 64), "invalid_topic_id");
  try {
    await requireIdentity();
    const body = formString(formData, "body", 2001).trim();
    if (Array.from(body).length < 1 || Array.from(body).length > 2000) throw new Error("invalid_comment");
    const supabase = await createClient();
    const { error } = await supabase.rpc("add_club_discussion_comment", {
      p_club_id: clubId, p_topic_id: topicId, p_body: body,
    });
    if (error) redirect(memberPath(clubId, topicId, "error", mapFailure(error)));
    revalidatePath("/topics");
    revalidatePath("/topics/" + topicId);
    redirect(memberPath(clubId, topicId, "success", "commented"));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT")) throw error;
    redirect(memberPath(clubId, topicId, "error", "invalid_input"));
  }
}

export async function castDiscussionVoteAction(formData: FormData) {
  const clubId = parseDiscussionUuid(formString(formData, "clubId", 64), "invalid_club_id");
  const topicId = parseDiscussionUuid(formString(formData, "topicId", 64), "invalid_topic_id");
  try {
    await requireIdentity();
    const optionId = parseDiscussionUuid(formString(formData, "optionId", 64), "invalid_option_id");
    const supabase = await createClient();
    const { error } = await supabase.rpc("cast_club_discussion_vote", {
      p_club_id: clubId, p_topic_id: topicId, p_option_id: optionId,
    });
    if (error) redirect(memberPath(clubId, topicId, "error", mapFailure(error)));
    revalidatePath("/topics");
    revalidatePath("/topics/" + topicId);
    revalidatePath("/dashboard");
    revalidatePath("/tasks");
    redirect(memberPath(clubId, topicId, "success", "voted"));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT")) throw error;
    redirect(memberPath(clubId, topicId, "error", "invalid_input"));
  }
}

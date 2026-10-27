import { notFound, redirect } from "next/navigation";
import { DiscussionTopicDetailView } from "@/components/discussion-topics/topic-detail";
import { requireIdentity } from "@/lib/auth";
import { requireClubPermission } from "@/lib/club-permissions.server";
import { parseDiscussionTopicDetail } from "@/lib/discussion-topics/contracts";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export default async function ManagementDiscussionTopicPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string; topicId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  await requireIdentity();
  const [{ clubId, topicId }, query] = await Promise.all([params, searchParams]);
  if (!uuidPattern.test(clubId) || !uuidPattern.test(topicId)) notFound();
  if (query.mode !== "management") {
    redirect(`/clubs/${encodeURIComponent(clubId)}/topics/${encodeURIComponent(topicId)}?mode=management`);
  }
  await requireClubPermission(clubId, "discussion.manage");
  const { data, error } = await (await createClient()).rpc("get_club_discussion_topic", {
    p_club_id: clubId,
    p_topic_id: topicId,
  });
  if (error?.code === "42501") redirect("/access-denied");
  if (error || !data) notFound();
  let topic;
  try { topic = parseDiscussionTopicDetail(data, clubId, topicId); } catch { notFound(); }
  return <DiscussionTopicDetailView clubId={clubId} topic={topic} managementView />;
}

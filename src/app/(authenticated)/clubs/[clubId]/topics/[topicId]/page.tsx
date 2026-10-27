import { notFound, redirect } from "next/navigation";
import { DiscussionTopicDetailView } from "@/components/discussion-topics/topic-detail";
import { Notice } from "@/components/ui";
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
  searchParams: Promise<{ mode?: string; success?: string; error?: string }>;
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
  const errorMessages: Record<string, string> = {
    forbidden: "目前帳號沒有管理議題的權限。",
    invalid_input: "欄位內容不正確，請檢查後再試。",
    structure_locked: "議題已有投票或留言，參與對象、選項和投票方式不能更改；其他欄位仍可編輯。",
    closed: "議題已刪除或目前不可編輯。",
    unexpected: "操作沒有完成，請稍後再試。",
  };
  return <div className="page-stack">
    {query.success === "updated" && <Notice tone="success">議題修改已儲存。</Notice>}
    {query.error && <Notice tone="error">{errorMessages[query.error] ?? errorMessages.unexpected}</Notice>}
    <DiscussionTopicDetailView clubId={clubId} topic={topic} managementView />
  </div>;
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DiscussionTopicComposer } from "@/components/discussion-topics/topic-composer";
import { Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { requireClubPermission } from "@/lib/club-permissions.server";
import { parseDiscussionTopicEditData } from "@/lib/discussion-topics/contracts";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((candidate): candidate is Record<string, unknown> =>
    typeof candidate === "object" && candidate !== null && !Array.isArray(candidate));
}

export default async function EditDiscussionTopicPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string; topicId: string }>;
  searchParams: Promise<{ mode?: string; error?: string }>;
}) {
  await requireIdentity();
  const [{ clubId, topicId }, query] = await Promise.all([params, searchParams]);
  if (!uuidPattern.test(clubId) || !uuidPattern.test(topicId)) notFound();
  if (query.mode !== "management") {
    redirect(`/clubs/${encodeURIComponent(clubId)}/topics/${encodeURIComponent(topicId)}/edit?mode=management`);
  }
  await requireClubPermission(clubId, "discussion.manage");

  const supabase = await createClient();
  const [topicResult, tagsResult, membersResult] = await Promise.all([
    supabase.rpc("get_club_discussion_topic_edit", { p_club_id: clubId, p_topic_id: topicId }),
    supabase.rpc("list_club_member_tags", { p_club_id: clubId }),
    supabase.rpc("list_club_members", { p_club_id: clubId, p_query: null, p_status: "active" }),
  ]);
  if (topicResult.error?.code === "42501") redirect("/access-denied");
  if (topicResult.error || !topicResult.data) notFound();
  if (tagsResult.error || membersResult.error) {
    return <div className="page-stack"><EditHeader clubId={clubId} topicId={topicId} />
      <Notice tone="error">目前無法載入社員名單或標籤，請稍後重新整理。</Notice>
    </div>;
  }

  let topic;
  try { topic = parseDiscussionTopicEditData(topicResult.data, clubId, topicId); } catch { notFound(); }
  const tagValues = rows((tagsResult.data as { tags?: unknown } | null)?.tags);
  const tags = tagValues.flatMap((row) => {
    if (typeof row.tag_id !== "string" || !uuidPattern.test(row.tag_id)
      || typeof row.tag_name !== "string" || !Number.isSafeInteger(row.member_count)) return [];
    return [{ tag_id: row.tag_id, tag_name: row.tag_name, member_count: row.member_count as number }];
  });
  const memberValues = Array.isArray(membersResult.data) ? membersResult.data : [];
  const members = memberValues.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const row = value as Record<string, unknown>;
    if (typeof row.membership_id !== "string" || !uuidPattern.test(row.membership_id)
      || typeof row.display_name !== "string") return [];
    return [{ membership_id: row.membership_id, display_name: row.display_name }];
  });

  const errorMessages: Record<string, string> = {
    structure_locked: "這個議題已有投票或留言，參與對象、選項和投票方式不能更改；其他欄位仍可編輯。",
    invalid_input: "欄位內容不正確，請檢查後再試。",
    closed: "議題已刪除或目前不可編輯。",
    unexpected: "儲存沒有完成，請稍後再試。",
  };

  return <div className="page-stack">
    <EditHeader clubId={clubId} topicId={topicId} />
    {query.error && <Notice tone="error">{errorMessages[query.error] ?? errorMessages.unexpected}</Notice>}
    <DiscussionTopicComposer clubId={clubId} tags={tags} members={members} initialTopic={topic} />
  </div>;
}

function EditHeader({ clubId, topicId }: { clubId: string; topicId: string }) {
  return <header className="page-header">
    <div><p className="eyebrow">社務管理 · 議題討論</p><h1>編輯議題</h1>
      <p>調整標題、說明或截止時間；有社員參與後，會保護既有投票與留言脈絡。</p></div>
    <Link className="button button-secondary"
      href={`/clubs/${encodeURIComponent(clubId)}/topics/${encodeURIComponent(topicId)}?mode=management`}
      prefetch={false}>返回議題</Link>
  </header>;
}

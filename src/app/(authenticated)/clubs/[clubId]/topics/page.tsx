import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DiscussionTopicComposer } from "@/components/discussion-topics/topic-composer";
import { Card, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { requireClubPermission } from "@/lib/club-permissions.server";
import { parseDiscussionTopicList } from "@/lib/discussion-topics/contracts";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const dateTime = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei", month: "long", day: "numeric", weekday: "short",
  hour: "2-digit", minute: "2-digit", hour12: false,
});

function audienceOptions(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((candidate): candidate is Record<string, unknown> =>
    typeof candidate === "object" && candidate !== null && !Array.isArray(candidate));
}

export default async function DiscussionTopicManagementPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ mode?: string; success?: string; error?: string }>;
}) {
  await requireIdentity();
  const [{ clubId }, query] = await Promise.all([params, searchParams]);
  if (!uuidPattern.test(clubId)) notFound();
  if (query.mode !== "management") redirect(`/clubs/${encodeURIComponent(clubId)}/topics?mode=management`);
  await requireClubPermission(clubId, "discussion.manage");

  const supabase = await createClient();
  const [topicsResult, tagsResult, membersResult] = await Promise.all([
    supabase.rpc("list_club_discussion_topics", { p_club_id: clubId }),
    supabase.rpc("list_club_member_tags", { p_club_id: clubId }),
    supabase.rpc("list_club_members", { p_club_id: clubId, p_query: null, p_status: "active" }),
  ]);
  if (topicsResult.error || tagsResult.error || membersResult.error) {
    return <div className="page-stack">
      <ManagementHeader />
      <Notice tone="error">目前無法載入議題或社員對象，請稍後重新整理。</Notice>
    </div>;
  }

  let topics;
  try { topics = parseDiscussionTopicList(topicsResult.data, clubId); } catch {
    return <div className="page-stack"><ManagementHeader />
      <Notice tone="error">議題資料格式或社別不一致，系統已停止顯示，避免混用其他扶輪社資料。</Notice>
    </div>;
  }
  const tagRows = audienceOptions((tagsResult.data as { tags?: unknown } | null)?.tags);
  const tags = tagRows.flatMap((row) => {
    if (typeof row.tag_id !== "string" || !uuidPattern.test(row.tag_id)
      || typeof row.tag_name !== "string" || !Number.isSafeInteger(row.member_count)) return [];
    return [{ tag_id: row.tag_id, tag_name: row.tag_name, member_count: row.member_count as number }];
  });
  const memberRows = Array.isArray(membersResult.data) ? membersResult.data : [];
  const members = memberRows.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const row = value as Record<string, unknown>;
    if (typeof row.membership_id !== "string" || !uuidPattern.test(row.membership_id)
      || typeof row.display_name !== "string") return [];
    return [{ membership_id: row.membership_id, display_name: row.display_name }];
  });

  const errorMessages: Record<string, string> = {
    forbidden: "目前帳號沒有管理議題的權限。",
    invalid_input: "欄位內容或參與對象不完整，請檢查後再試。",
    closed: "議題已截止，無法執行這項操作。",
    structure_locked: "議題已有投票或留言，參與對象、選項和投票方式不能更改。",
    unexpected: "操作沒有完成，請稍後再試。",
  };

  return <div className="page-stack">
    <ManagementHeader />
    {query.success === "published" && <Notice tone="success">議題已發佈，指定社員可在社員模式看到議題與投票提醒。</Notice>}
    {query.success === "deleted" && <Notice tone="success">議題已從社員端隱藏，投票與留言歷史已保留。</Notice>}
    {query.error && <Notice tone="error">{errorMessages[query.error] ?? errorMessages.unexpected}</Notice>}
    <Notice>截止後社員仍可閱讀歷史內容，但不能再留言或投票；未完成的待辦提醒也會自動消失。</Notice>
    <DiscussionTopicComposer clubId={clubId} tags={tags} members={members} />
    <section className="page-stack" aria-labelledby="topic-list-heading">
      <div className="section-heading"><div><p className="eyebrow">管理清單</p><h2 id="topic-list-heading">已發佈議題</h2></div></div>
      {topics.length === 0 ? <Card><p>目前還沒有議題。</p></Card> : <div className="card-grid">
        {topics.map((topic) => <Link key={topic.id} className="card card-link"
          href={`/clubs/${encodeURIComponent(clubId)}/topics/${encodeURIComponent(topic.id)}?mode=management`}
          prefetch={false}>
          <div className="section-heading">
            <div><p className="eyebrow">{topic.isOpen ? "討論中" : "已截止"}</p><h3>{topic.title}</h3></div>
            <span>{topic.audienceCount ?? 0} 位對象</span>
          </div>
          <p>{topic.description}</p>
          <p className="hint">截止：{dateTime.format(new Date(topic.deadlineAt))} · {topic.anonymousVotes ? "匿名投票" : "具名投票"} · {topic.voteCount} 票 · {topic.commentCount} 則留言</p>
          {topic.audienceTags && topic.audienceTags.length > 0 && <p className="hint">標籤：{topic.audienceTags.join("、")}</p>}
        </Link>)}
      </div>}
    </section>
  </div>;
}

function ManagementHeader() {
  return <header className="page-header">
    <div><p className="eyebrow">社務管理 · 社內互動</p><h1>議題討論管理</h1>
      <p>發佈要討論的議題，指定全社、標籤或個別社員，並查看進度。</p></div>
    <Link className="button button-secondary" href="/dashboard?mode=management" prefetch={false}>返回社務總覽</Link>
  </header>;
}

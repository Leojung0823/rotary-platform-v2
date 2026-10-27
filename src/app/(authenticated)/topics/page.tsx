import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DiscussionTopicListCard } from "@/components/discussion-topics/topic-list-card";
import styles from "@/components/discussion-topics/topic-list.module.css";
import { Card, EmptyState, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { activeClubForMode } from "@/lib/experience-context";
import { activeClubCookieName, readActiveClubPreference } from "@/lib/experience-context-cookie";
import { resolveExperienceContext } from "@/lib/experience-context.server";
import { currentExperienceMode } from "@/lib/experience-mode.server";
import { parseDiscussionTopicList } from "@/lib/discussion-topics/contracts";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DiscussionTopicsPage({
  searchParams,
}: {
  searchParams: Promise<{ clubId?: string; mode?: string }>;
}) {
  const [identity, query, cookieStore] = await Promise.all([requireIdentity(), searchParams, cookies()]);
  const preferredClubId = readActiveClubPreference(query.clubId)
    ?? readActiveClubPreference(cookieStore.get(activeClubCookieName)?.value);
  const [contextResolution, mode] = await Promise.all([
    resolveExperienceContext(preferredClubId),
    currentExperienceMode(identity.id),
  ]);
  if ((mode !== null && mode !== "member") || query.mode === "management") redirect("/access-denied");
  if (!contextResolution.ok) {
    if (contextResolution.reason === "authorization_denied") redirect("/access-denied");
    return <div className={`page-stack ${styles.page}`}><TopicHeader /><Notice tone="error">目前無法確認社員社籍，請稍後重新整理。</Notice></div>;
  }

  const requestedClubId = readActiveClubPreference(query.clubId);
  const activeClub = requestedClubId
    ? contextResolution.context.memberClubs.find((club) => club.clubId.toLowerCase() === requestedClubId.toLowerCase())
      ?? activeClubForMode(contextResolution.context, "member")
    : activeClubForMode(contextResolution.context, "member");
  if (!activeClub) {
    return <div className={`page-stack ${styles.page}`}><TopicHeader />
      <EmptyState title="目前沒有可參與的議題" body="議題只會顯示在您有有效社員社籍的扶輪社中。" />
    </div>;
  }

  const { data, error } = await (await createClient()).rpc("list_my_club_discussion_topics", {
    p_club_id: activeClub.clubId,
  });
  if (error?.code === "42501") redirect("/access-denied");
  if (error || !data) {
    return <div className={`page-stack ${styles.page}`}><TopicHeader clubName={activeClub.clubName} />
      <Notice tone="error">目前無法載入議題，請稍後重新整理。</Notice>
    </div>;
  }
  let topics;
  try {
    topics = parseDiscussionTopicList(data, activeClub.clubId);
  } catch {
    return <div className={`page-stack ${styles.page}`}><TopicHeader clubName={activeClub.clubName} />
      <Notice tone="error">議題資料格式或社別不一致，系統已停止顯示，避免混用其他扶輪社資料。</Notice>
    </div>;
  }

  return <div className={`page-stack ${styles.page}`}>
    <TopicHeader clubName={activeClub.clubName} />
    {topics.length === 0
      ? <Card><EmptyState title="目前沒有發佈中的議題" body="幹部發佈議題後，您可以在這裡留言和投票。" /></Card>
      : <section className={styles.list} aria-label="議題清單">
        <div className={styles.listHeading}>
          <h2>本社議題</h2><span>{topics.length} 件</span>
        </div>
        {topics.map((topic) => <DiscussionTopicListCard key={topic.id} topic={topic}
          href={`/topics/${encodeURIComponent(topic.id)}?clubId=${encodeURIComponent(activeClub.clubId)}&mode=member`} />)}
      </section>}
  </div>;
}

function TopicHeader({ clubName }: { clubName?: string }) {
  return <header className={styles.header}>
    <div className={styles.headerTop}>
      <p className={styles.context}>社內互動{clubName ? " · " + clubName : ""}</p>
      <Link className={styles.backLink} href="/interact?mode=member" prefetch={false}>返回社內互動</Link>
    </div>
    <h1 className={styles.pageTitle}>議題討論</h1>
    <p className={styles.intro}>看看社員關心的議題，留下想法並用投票表達意見。</p>
  </header>;
}

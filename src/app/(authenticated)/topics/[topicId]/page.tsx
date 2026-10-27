import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Notice } from "@/components/ui";
import { DiscussionTopicDetailView } from "@/components/discussion-topics/topic-detail";
import { requireIdentity } from "@/lib/auth";
import { activeClubForMode } from "@/lib/experience-context";
import { activeClubCookieName, readActiveClubPreference } from "@/lib/experience-context-cookie";
import { resolveExperienceContext } from "@/lib/experience-context.server";
import { currentExperienceMode } from "@/lib/experience-mode.server";
import { parseDiscussionTopicDetail } from "@/lib/discussion-topics/contracts";
import { parseDiscussionUuid } from "@/lib/discussion-topics/validation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MemberDiscussionTopicPage({
  params,
  searchParams,
}: {
  params: Promise<{ topicId: string }>;
  searchParams: Promise<{ clubId?: string; mode?: string; success?: string; error?: string }>;
}) {
  const [identity, { topicId: rawTopicId }, query, cookieStore] = await Promise.all([
    requireIdentity(), params, searchParams, cookies(),
  ]);
  let topicId: string;
  try { topicId = parseDiscussionUuid(rawTopicId, "invalid_topic_id"); } catch { notFound(); }
  const preferredClubId = readActiveClubPreference(query.clubId)
    ?? readActiveClubPreference(cookieStore.get(activeClubCookieName)?.value);
  const [contextResolution, mode] = await Promise.all([
    resolveExperienceContext(preferredClubId),
    currentExperienceMode(identity.id),
  ]);
  if ((mode !== null && mode !== "member") || query.mode === "management") redirect("/access-denied");
  if (!contextResolution.ok) {
    if (contextResolution.reason === "authorization_denied") redirect("/access-denied");
    return <div className="page-stack"><Notice tone="error">目前無法確認社員社籍，請稍後重新整理。</Notice></div>;
  }
  const requestedClubId = readActiveClubPreference(query.clubId);
  const activeClub = requestedClubId
    ? contextResolution.context.memberClubs.find((club) => club.clubId.toLowerCase() === requestedClubId.toLowerCase())
      ?? activeClubForMode(contextResolution.context, "member")
    : activeClubForMode(contextResolution.context, "member");
  if (!activeClub) redirect("/access-denied");

  const { data, error } = await (await createClient()).rpc("get_my_club_discussion_topic", {
    p_club_id: activeClub.clubId,
    p_topic_id: topicId,
  });
  if (error?.code === "42501") redirect("/access-denied");
  if (error || !data) notFound();
  let topic;
  try { topic = parseDiscussionTopicDetail(data, activeClub.clubId, topicId); } catch { notFound(); }
  const successMessage = query.success === "voted" ? "投票已記錄；截止前可以再次改票。"
    : query.success === "commented" ? "留言已送出。" : null;
  const errorMessage = query.error === "closed" ? "議題已截止，或您不在此議題的參與對象中。"
    : query.error === "invalid_input" ? "留言或投票資料不正確，請檢查後再試。"
      : query.error ? "操作沒有完成，請稍後再試。" : null;
  return <div className="page-stack">
    {successMessage && <Notice tone="success">{successMessage}</Notice>}
    {errorMessage && <Notice tone="error">{errorMessage}</Notice>}
    <DiscussionTopicDetailView clubId={activeClub.clubId} topic={topic} />
  </div>;
}

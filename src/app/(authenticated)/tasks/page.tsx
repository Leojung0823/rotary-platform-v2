import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Card, EmptyState, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { activeClubForMode } from "@/lib/experience-context";
import { activeClubCookieName, readActiveClubPreference } from "@/lib/experience-context-cookie";
import { resolveExperienceContext } from "@/lib/experience-context.server";
import { currentExperienceMode } from "@/lib/experience-mode.server";
import { lineOaTaskFrom } from "@/lib/member-portal/from-projection";
import { parseMemberTaskPage } from "@/lib/member-home";
import { memberTaskCenterSlice, memberTaskPageSize } from "@/lib/member-home/task-center-page";
import { resolveLineOaOnboardingStatus } from "@/lib/line/oa-onboarding.server";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { createClient } from "@/lib/supabase/server";
import styles from "./tasks.module.css";

const maximumOffset = 100_000;

function readOffset(value: string | undefined): number | null {
  if (value === undefined) return 0;
  if (!/^\d{1,6}$/u.test(value)) return null;
  const offset = Number(value);
  return Number.isSafeInteger(offset) && offset <= maximumOffset ? offset : null;
}

function pageHref(clubId: string, offset: number) {
  const query = new URLSearchParams({ clubId, mode: "member" });
  if (offset > 0) query.set("offset", String(offset));
  return `/tasks?${query.toString()}`;
}

export default async function MemberTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ clubId?: string; mode?: string; offset?: string }>;
}) {
  const [identity, query, cookieStore] = await Promise.all([requireIdentity(), searchParams, cookies()]);
  const offset = readOffset(query.offset);
  if (offset === null) redirect("/tasks?mode=member");

  const preferredClubId = readActiveClubPreference(query.clubId)
    ?? readActiveClubPreference(cookieStore.get(activeClubCookieName)?.value);
  const contextPromise = resolveExperienceContext(preferredClubId);
  const [homeEvaluation, lineEvaluation, mode, contextResolution] = await Promise.all([
    evaluateCurrentFeatureFlag({ key: "member_home_v2", subjectUuid: identity.id }),
    evaluateCurrentFeatureFlag({ key: "line_oa_onboarding_v1", subjectUuid: identity.id }),
    currentExperienceMode(identity.id),
    contextPromise,
  ]);
  if (!homeEvaluation.enabled) notFound();
  if (mode === "management" || (query.mode === "management" && mode !== null)) redirect("/access-denied");

  if (!contextResolution.ok) {
    if (contextResolution.reason === "authorization_denied") redirect("/access-denied");
    return <div className="page-stack"><TaskHeader /><Notice tone="error">目前無法確認您的社員社籍，請稍後重新整理。</Notice></div>;
  }

  // The route is member-only: an arbitrary clubId can select only a verified
  // active membership. Manager-only clubs are never used as a fallback.
  const requestedClubId = readActiveClubPreference(query.clubId);
  const activeClub = requestedClubId
    ? contextResolution.context.memberClubs.find((club) => club.clubId.toLowerCase() === requestedClubId.toLowerCase())
      ?? activeClubForMode(contextResolution.context, "member")
    : activeClubForMode(contextResolution.context, "member");
  if (!activeClub) {
    return <div className="page-stack"><TaskHeader /><EmptyState title="目前沒有可查看的待辦事項" body="社員待辦只會顯示您有有效社籍的扶輪社任務。" /></div>;
  }

  const supabase = await createClient();
  const [taskResult, lineOaResolution] = await Promise.all([
    supabase.rpc("list_my_member_pending_tasks", {
      p_club_id: activeClub.clubId,
      p_limit: memberTaskPageSize,
      p_offset: offset,
      p_all_tasks: true,
    }),
    lineEvaluation.enabled
      ? resolveLineOaOnboardingStatus(activeClub.clubId)
      : Promise.resolve(null),
  ]);
  if (taskResult.error || !taskResult.data) {
    if (taskResult.error?.code === "42501") redirect("/access-denied");
    return <div className="page-stack"><TaskHeader clubName={activeClub.clubName} /><Notice tone="error">目前無法載入待辦事項，請稍後重新整理。</Notice></div>;
  }

  const page = parseMemberTaskPage(taskResult.data, {
    clubId: activeClub.clubId,
    offset,
    pageSize: memberTaskPageSize,
  });
  if (!page) {
    return <div className="page-stack"><TaskHeader clubName={activeClub.clubName} /><Notice tone="error">待辦資料格式或社別不一致，系統已停止顯示，避免混用其他社資料。</Notice></div>;
  }

  const lineOaTask = lineOaResolution?.ok
    ? lineOaTaskFrom(lineOaResolution.status, activeClub.clubId)
    : null;
  const taskSlice = memberTaskCenterSlice(page, lineOaTask);

  return <div className="page-stack">
    <TaskHeader clubName={activeClub.clubName} />
    <Card className={styles.summary}>
      <div>
        <p className="eyebrow">目前尚未完成</p>
        <strong>{taskSlice.totalCount}</strong>
        <span>項待辦</span>
      </div>
      {taskSlice.totalCount > 0 && <span className={styles.pageStatus}>
        第 {taskSlice.pageNumber} 頁，共 {taskSlice.pageCount} 頁
      </span>}
    </Card>

    {taskSlice.tasks.length === 0
      ? <Card><EmptyState title="太好了，目前沒有待辦事項" body="有新的活動回覆、生日祝福或社內事項時，會列在這裡。" /></Card>
      : <Card className={styles.list} aria-label="社員待辦清單">
        {taskSlice.tasks.map((task) => <Link className={styles.row} key={task.id} href={task.href} prefetch={false}>
          <span className={styles.rowBody}>
            <strong>{task.title}</strong>
            {task.detail !== "" && <small>{task.detail}</small>}
          </span>
          <span className={styles.rowEnd}>
            {task.status && <span className={task.tone === "danger" ? styles.urgent : styles.status}>{task.status}</span>}
            <span aria-hidden="true" className={styles.chevron}>›</span>
          </span>
        </Link>)}
      </Card>}

    {(taskSlice.previousOffset !== null || taskSlice.nextOffset !== null) && <nav className={styles.pagination} aria-label="待辦分頁">
      {taskSlice.previousOffset !== null
        ? <Link className="button button-secondary" href={pageHref(activeClub.clubId, taskSlice.previousOffset)} prefetch={false}>上一頁</Link>
        : <span />}
      <span>每頁最多 {memberTaskPageSize} 項</span>
      {taskSlice.nextOffset !== null
        ? <Link className="button" href={pageHref(activeClub.clubId, taskSlice.nextOffset)} prefetch={false}>下一頁</Link>
        : <span />}
    </nav>}
  </div>;
}

function TaskHeader({ clubName }: { clubName?: string }) {
  return <header className="page-header">
    <div>
      <p className="eyebrow">社員首頁 · 待辦事項</p>
      <h1>我的待辦</h1>
      <p>{clubName ? `以下只列出「${clubName}」中需要您處理的事項。` : "只顯示您目前社員社籍扶輪社中需要處理的事項。"}</p>
    </div>
    <Link className="button button-secondary" href="/dashboard?mode=member" prefetch={false}>返回社員首頁</Link>
  </header>;
}

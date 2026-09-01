import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArchiveManagementPanel } from "@/components/archive/archive-management-panel";
import { Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { parseArchivePageProjection } from "@/lib/archive/contracts";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const successMessages: Record<string, string> = {
  year_created: "扶輪年度與交接清單已建立。",
  year_updated: "年度基本資料已更新。",
  item_created: "文件項目已建立，現在可以上傳第一個版本。",
  item_updated: "文件說明與保密級別已更新。",
  item_archived: "文件項目已封存，歷史版本仍保留。",
  version_uploaded: "新文件版本已安全上傳。",
  checklist_updated: "交接清單已更新。",
  handover_confirmed: "交接確認已留下姓名與時間紀錄。",
};

const errorMessages: Record<string, string> = {
  invalid_input: "輸入內容不完整或格式不正確。",
  already_exists: "這個扶輪年度已經建立。",
  checklist_incomplete: "必要交接項目尚未全部確認，現在不能完成交接。",
  forbidden: "您沒有執行這項操作的權限。",
  unexpected: "操作沒有完成，請稍後再試。",
};

export default async function ArchiveManagementPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ mode?: string; yearId?: string; success?: string; error?: string }>;
}) {
  const [identity, { clubId }, query] = await Promise.all([requireIdentity(), params, searchParams]);
  if (!uuidPattern.test(clubId)) notFound();

  const evaluation = await evaluateCurrentFeatureFlag({
    key: "archive_handover_v1",
    subjectUuid: identity.id,
  });
  if (!evaluation.enabled) notFound();
  if (query.mode !== "management") {
    const canonicalQuery = new URLSearchParams({ mode: "management" });
    if (query.yearId) canonicalQuery.set("yearId", query.yearId);
    redirect(`/clubs/${encodeURIComponent(clubId)}/archives?${canonicalQuery.toString()}`);
  }

  // The management route has no search filters. That keeps the checklist's
  // document selector complete and lets this page render the whole manager
  // surface with one projection read.
  const result = await (await createClient()).rpc("get_my_archive_page", {
    p_club_id: clubId,
    p_rotary_year_id: query.yearId ?? null,
    p_query: null,
    p_category: null,
  });
  if (result.error?.code === "42501") redirect("/access-denied");
  if (result.error || !result.data) {
    return <div className="page-stack">
      <header className="page-header">
        <div><p className="eyebrow">社務傳承 · 社務管理</p><h1>文件中心與年度交接</h1></div>
        <a className="button button-secondary" href={`/archives?clubId=${encodeURIComponent(clubId)}&mode=member`}>返回社員頁</a>
      </header>
      <Notice tone="error">目前無法確認這個扶輪社的文件管理權限，請稍後重新整理。</Notice>
    </div>;
  }

  let page;
  try {
    page = parseArchivePageProjection(result.data);
  } catch {
    return <div className="page-stack">
      <header className="page-header">
        <div><p className="eyebrow">社務傳承 · 社務管理</p><h1>文件中心與年度交接</h1></div>
      </header>
      <Notice tone="error">文件資料格式不完整，系統已停止顯示，避免跨社資料混用。</Notice>
    </div>;
  }

  const selectedClub = page.clubs.find((club) => club.clubId.toLowerCase() === clubId.toLowerCase()) ?? null;
  const selectedYear = page.years.find((year) => year.id === page.selectedYearId) ?? null;
  if (page.selectedClubId?.toLowerCase() !== clubId.toLowerCase() || !selectedClub || !page.canManage) {
    redirect("/access-denied");
  }

  return <div className="page-stack">
    <header className="page-header">
      <div>
        <p className="eyebrow">{selectedClub.clubCode} · 社務管理</p>
        <h1>文件中心與年度交接</h1>
        <p>{selectedClub.clubName}的年度文件、版本與交接狀態。</p>
      </div>
      <div className="form-actions">
        <a className="button button-secondary" href={`/archives?clubId=${encodeURIComponent(selectedClub.clubId)}&mode=member`}>查看社員頁</a>
        <Link className="button button-secondary" href={`/dashboard?mode=management`}>返回社務總覽</Link>
      </div>
    </header>
    {query.success && successMessages[query.success] && <Notice tone="success">{successMessages[query.success]}</Notice>}
    {query.error && <Notice tone="error">{errorMessages[query.error] ?? errorMessages.unexpected}</Notice>}
    <ArchiveManagementPanel page={page} selectedClub={selectedClub} selectedYear={selectedYear} />
  </div>;
}

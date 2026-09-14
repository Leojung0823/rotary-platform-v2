import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { DuesFinanceMember } from "@/components/dues-finance/dues-finance-member";
import { EmptyState, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { parseDuesFinanceMemberLedger, parseDuesFinanceYearList } from "@/lib/dues-finance/contracts";
import { activeClubForMode } from "@/lib/experience-context";
import { activeClubCookieName, readActiveClubPreference } from "@/lib/experience-context-cookie";
import { resolveExperienceContext } from "@/lib/experience-context.server";
import { currentExperienceMode } from "@/lib/experience-mode.server";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export default async function DuesFinanceMemberPage({
  searchParams,
}: {
  searchParams: Promise<{ clubId?: string; yearId?: string; mode?: string }>;
}) {
  const [identity, query, cookieStore] = await Promise.all([requireIdentity(), searchParams, cookies()]);
  const [evaluation, mode] = await Promise.all([
    evaluateCurrentFeatureFlag({ key: "dues_finance_v1", subjectUuid: identity.id }),
    currentExperienceMode(identity.id),
  ]);
  if (!evaluation.enabled) notFound();

  const preferredClubId = readActiveClubPreference(query.clubId)
    ?? readActiveClubPreference(cookieStore.get(activeClubCookieName)?.value);
  const contextResolution = await resolveExperienceContext(preferredClubId);
  if (!contextResolution.ok) return <Notice tone="error">目前無法確認您的社員社籍，請稍後重新整理。</Notice>;

  if (query.mode === "management") {
    if (mode !== "management") redirect("/access-denied");
    const managementClub = activeClubForMode(contextResolution.context, "management");
    if (!managementClub) redirect("/access-denied");
    redirect(`/clubs/${encodeURIComponent(managementClub.clubId)}/dues?mode=management`);
  }
  if (mode === "management") {
    const managementClub = activeClubForMode(contextResolution.context, "management");
    if (!managementClub) redirect("/access-denied");
    redirect(`/clubs/${encodeURIComponent(managementClub.clubId)}/dues?mode=management`);
  }

  const requestedClubId = typeof query.clubId === "string" && uuidPattern.test(query.clubId)
    ? query.clubId.toLowerCase()
    : null;
  const activeClub = contextResolution.context.memberClubs.find((club) => club.clubId.toLowerCase() === requestedClubId)
    ?? activeClubForMode(contextResolution.context, "member");
  if (!activeClub) {
    return <div className="page-stack"><DuesMemberHeader /><EmptyState title="目前沒有可查看的社費資料" body="社員模式只顯示您有有效社籍的扶輪社資料。" /></div>;
  }

  const supabase = await createClient();
  const yearsResult = await supabase.rpc("list_my_dues_finance_rotary_years", { p_club_id: activeClub.clubId });
  if (yearsResult.error?.code === "42501") return <div className="page-stack"><DuesMemberHeader clubName={activeClub.clubName} /><Notice tone="error">目前無法確認您的社員社籍。</Notice></div>;
  let years;
  try {
    years = parseDuesFinanceYearList(yearsResult.data);
  } catch {
    years = [];
  }
  if (years.length === 0) {
    return <div className="page-stack"><DuesMemberHeader clubName={activeClub.clubName} /><EmptyState title="尚未建立扶輪年度" body="社團尚未建立可以查看的社費年度。" /></div>;
  }
  if (years.some((year) => year.clubId !== activeClub.clubId.toLowerCase())) return <div className="page-stack"><DuesMemberHeader clubName={activeClub.clubName} /><Notice tone="error">年度資料格式不完整，系統已停止顯示。</Notice></div>;
  const selectedYear = years.find((year) => year.id === query.yearId?.toLowerCase()) ?? years[0];
  const ledgerResult = await supabase.rpc("get_my_dues_finance_ledger", {
    p_club_id: activeClub.clubId,
    p_rotary_year_id: selectedYear.id,
  });
  if (ledgerResult.error?.code === "42501") return <div className="page-stack"><DuesMemberHeader clubName={activeClub.clubName} /><Notice tone="error">目前無法確認您的社員社籍。</Notice></div>;
  let ledger;
  try {
    ledger = parseDuesFinanceMemberLedger(ledgerResult.data);
  } catch {
    ledger = null;
  }
  if (!ledger || ledger.clubId !== activeClub.clubId.toLowerCase() || ledger.rotaryYearId !== selectedYear.id) {
    return <div className="page-stack"><DuesMemberHeader clubName={activeClub.clubName} /><Notice tone="error">社費資料格式不完整，系統已停止顯示，避免社別或年度資料混用。</Notice></div>;
  }

  return <div className="page-stack">
    <DuesMemberHeader clubName={activeClub.clubName} />
    {contextResolution.context.memberClubs.length > 1 && <nav className="tabs" aria-label="我的扶輪社">{contextResolution.context.memberClubs.map((club) => <Link key={club.clubId} href={`/dues?clubId=${encodeURIComponent(club.clubId)}&mode=member`} prefetch={false} aria-current={club.clubId === activeClub.clubId ? "page" : undefined}>{club.clubName}</Link>)}</nav>}
    <section><div className="section-heading"><div><p className="eyebrow">扶輪年度</p><h2>查看年度</h2></div><span>{years.length} 個年度</span></div><nav className="tabs" aria-label="我的社費扶輪年度">{years.map((year) => <Link key={year.id} href={`/dues?clubId=${encodeURIComponent(activeClub.clubId)}&yearId=${encodeURIComponent(year.id)}&mode=member`} prefetch={false} aria-current={year.id === selectedYear.id ? "page" : undefined}>{year.label}</Link>)}</nav></section>
    <DuesFinanceMember initialLedger={ledger} />
  </div>;
}

function DuesMemberHeader({ clubName }: { clubName?: string }) {
  return <header className="page-header"><div><p className="eyebrow">社員首頁 · 社費</p><h1>我的社費</h1><p>{clubName ? `${clubName}的年度應收、收款與代墊狀態。` : "只顯示您自己的社費與代墊資料。"}</p></div><Link className="button button-secondary" href="/dashboard?mode=member" prefetch={false}>返回社員首頁</Link></header>;
}

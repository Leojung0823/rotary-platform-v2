import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DuesFinanceManagement } from "@/components/dues-finance/dues-finance-management";
import { EmptyState, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import {
  parseDuesFinanceAnnualDefault,
  parseDuesFinanceManagementLedger,
  parseDuesFinanceYearList,
} from "@/lib/dues-finance/contracts";
import { clubsForExperienceMode } from "@/lib/experience-context";
import { resolveExperienceContext } from "@/lib/experience-context.server";
import { readClubPermissions } from "@/lib/club-permissions.server";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type MemberOption = Readonly<{ membershipId: string; displayName: string }>;

function parseMemberOptions(value: unknown): readonly MemberOption[] {
  if (!Array.isArray(value) || value.length > 500) return [];
  const options: MemberOption[] = [];
  for (const row of value) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) continue;
    const item = row as { membership_id?: unknown; display_name?: unknown; membership_status?: unknown };
    if (typeof item.membership_id !== "string" || !uuidPattern.test(item.membership_id)
      || typeof item.display_name !== "string" || item.display_name.length === 0
      || item.display_name.length > 300
      || item.membership_status !== "active") continue;
    options.push({ membershipId: item.membership_id.toLowerCase(), displayName: item.display_name });
  }
  return [...new Map(options.map((option) => [option.membershipId, option])).values()];
}

export default async function DuesFinanceManagementPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ mode?: string; yearId?: string }>;
}) {
  const [identity, { clubId }, query] = await Promise.all([requireIdentity(), params, searchParams]);
  if (!uuidPattern.test(clubId)) notFound();
  if (query.mode !== "management") redirect(`/clubs/${encodeURIComponent(clubId)}/dues?mode=management`);

  const [evaluation, contextResolution] = await Promise.all([
    evaluateCurrentFeatureFlag({ key: "dues_finance_v1", subjectUuid: identity.id }),
    resolveExperienceContext(clubId),
  ]);
  if (!evaluation.enabled) notFound();
  const managementClub = contextResolution.ok
    ? clubsForExperienceMode(contextResolution.context, "management").find((club) => club.clubId.toLowerCase() === clubId.toLowerCase()) ?? null
    : null;
  if (!managementClub) redirect("/access-denied");

  const supabase = await createClient();
  const [permissionsResult, yearsResult, membersResult] = await Promise.all([
    readClubPermissions(clubId),
    supabase.rpc("list_dues_finance_rotary_years", { p_club_id: clubId }),
    supabase.rpc("list_club_members", { p_club_id: clubId, p_query: null, p_status: "active" }),
  ]);
  if (!permissionsResult.ok || !permissionsResult.permissions.includes("finance.read")) redirect("/access-denied");

  let years;
  try {
    years = parseDuesFinanceYearList(yearsResult.data);
  } catch {
    years = [];
  }
  if (years.length === 0) {
    return <div className="page-stack">
      <DuesHeader clubId={clubId} clubName={managementClub.clubName} />
      <EmptyState title="尚未建立扶輪年度" body="請先建立扶輪年度，才能設定社費與核銷資料。" />
    </div>;
  }
  if (years.some((year) => year.clubId !== clubId.toLowerCase())) redirect("/access-denied");
  const requestedYearId = typeof query.yearId === "string" ? query.yearId.toLowerCase() : null;
  const selectedYear = years.find((year) => year.id === requestedYearId) ?? years[0];

  const [ledgerResult, defaultResult] = await Promise.all([
    supabase.rpc("get_club_dues_finance_ledger", {
      p_club_id: clubId,
      p_rotary_year_id: selectedYear.id,
      p_limit: 500,
    }),
    supabase.rpc("get_club_dues_annual_default", {
      p_club_id: clubId,
      p_rotary_year_id: selectedYear.id,
    }),
  ]);
  if (ledgerResult.error?.code === "42501" || defaultResult.error?.code === "42501") redirect("/access-denied");

  let ledger;
  let annualDefault;
  try {
    ledger = parseDuesFinanceManagementLedger(ledgerResult.data);
    annualDefault = parseDuesFinanceAnnualDefault(defaultResult.data);
  } catch {
    ledger = null;
    annualDefault = null;
  }
  if (!ledger || ledger.clubId !== clubId.toLowerCase() || ledger.rotaryYearId !== selectedYear.id
    || (annualDefault && (annualDefault.clubId !== ledger.clubId || annualDefault.rotaryYearId !== ledger.rotaryYearId))) {
    return <div className="page-stack">
      <DuesHeader clubId={clubId} clubName={managementClub.clubName} />
      <Notice tone="error">財務資料格式不完整，系統已停止顯示，避免社別或年度資料混用。</Notice>
    </div>;
  }

  return <div className="page-stack">
    <DuesHeader clubId={clubId} clubName={managementClub.clubName} yearId={selectedYear.id} />
    <section>
      <div className="section-heading"><div><p className="eyebrow">扶輪年度</p><h2>選擇年度</h2></div><span>{years.length} 個年度</span></div>
      <nav className="tabs" aria-label="社費扶輪年度">
        {years.map((year) => <Link key={year.id} href={`/clubs/${encodeURIComponent(clubId)}/dues?mode=management&yearId=${encodeURIComponent(year.id)}`} prefetch={false} aria-current={year.id === selectedYear.id ? "page" : undefined}>{year.label}</Link>)}
      </nav>
    </section>
    {membersResult.error && <Notice>社員選單目前無法載入；查看功能仍可使用，新增應收與代墊會暫時停用。</Notice>}
    <DuesFinanceManagement
      key={selectedYear.id}
      initialLedger={ledger}
      annualDefault={annualDefault}
      members={parseMemberOptions(membersResult.data)}
      permissions={{
        canManage: permissionsResult.permissions.includes("finance.manage"),
        canApprove: permissionsResult.permissions.includes("finance.approve"),
      }}
    />
  </div>;
}

function DuesHeader({ clubId, clubName, yearId }: { clubId: string; clubName: string; yearId?: string }) {
  return <header className="page-header">
    <div>
      <p className="eyebrow">社費與核銷 · 社務管理</p>
      <h1>社費與核銷</h1>
      <p>{clubName}的應收、收款、代墊與核銷；所有變更都保留紀錄，不能直接刪除。</p>
    </div>
    <div className="form-actions">
      {yearId && <>
        <a className="button button-secondary" href={`/api/v1/dues-finance/export?club_id=${encodeURIComponent(clubId)}&year_id=${encodeURIComponent(yearId)}&format=csv`}>下載 CSV</a>
        <a className="button button-secondary" href={`/api/v1/dues-finance/export?club_id=${encodeURIComponent(clubId)}&year_id=${encodeURIComponent(yearId)}&format=xlsx`}>下載 Excel</a>
        <a className="button button-secondary" href={`/api/v1/dues-finance/export?club_id=${encodeURIComponent(clubId)}&year_id=${encodeURIComponent(yearId)}&format=pdf`}>下載 PDF</a>
        <a className="button button-secondary" href={`/dues?clubId=${encodeURIComponent(clubId)}${yearId ? `&yearId=${encodeURIComponent(yearId)}` : ""}&mode=member`}>查看社員頁</a>
      </>}
      <Link className="button button-secondary" href="/dashboard?mode=management" prefetch={false}>返回社務總覽</Link>
    </div>
  </header>;
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BlessingIouReport } from "@/components/blessing-iou/blessing-iou-report";
import { Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { parseBlessingIouRotaryYearReport } from "@/lib/blessing-iou/reporting-contracts";
import { parseRotaryYearStart } from "@/lib/blessing-iou/reporting-validation";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { createClient } from "@/lib/supabase/server";

function currentTaipeiRotaryYearStart() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value ?? new Date().getUTCFullYear());
  const month = Number(parts.find((part) => part.type === "month")?.value ?? new Date().getUTCMonth() + 1);
  return month >= 7 ? year : year - 1;
}

function normalizedRotaryYear(value: string | undefined) {
  const current = currentTaipeiRotaryYearStart();
  try {
    return Math.min(parseRotaryYearStart(value ?? String(current)), current);
  } catch {
    return current;
  }
}

export default async function BlessingIouReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const [identity, { clubId }, query] = await Promise.all([requireIdentity(), params, searchParams]);
  const [coreEvaluation, reportingEvaluation] = await Promise.all([
    evaluateCurrentFeatureFlag({ key: "blessing_iou_v1", subjectUuid: identity.id }),
    evaluateCurrentFeatureFlag({ key: "blessing_iou_reporting_v1", subjectUuid: identity.id }),
  ]);
  if (!coreEvaluation.enabled || !reportingEvaluation.enabled) notFound();

  const rotaryYearStart = normalizedRotaryYear(query.year);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_blessing_iou_rotary_year_report", {
    p_club_id: clubId,
    p_rotary_year_start: rotaryYearStart,
  });
  if (error?.code === "42501") redirect("/access-denied");

  let report;
  try {
    report = error ? null : parseBlessingIouRotaryYearReport(data);
  } catch {
    report = null;
  }

  if (!report) {
    return <div className="page-stack">
      <header className="page-header"><div><p className="eyebrow">祝福 IOU</p><h1>扶輪年度統計</h1></div></header>
      <Notice tone="error">目前無法載入扶輪年度報表，請稍後重新整理。</Notice>
    </div>;
  }

  const basePath = `/clubs/${encodeURIComponent(report.clubId)}/blessing-iou/reports`;
  const currentYear = currentTaipeiRotaryYearStart();
  return <div className="page-stack">
    <header className="page-header">
      <div>
        <Link className="back-link" href={`/clubs/${encodeURIComponent(report.clubId)}/blessing-iou?mode=management`}>← 返回祝福 IOU 管理</Link>
        <p className="eyebrow">{report.clubCode} · 財務報表</p>
        <h1>扶輪年度統計</h1>
        <p>{report.clubName} · {report.rotaryYearLabel} 年度（{report.startsOn}～{report.endsOn}）</p>
      </div>
    </header>

    <nav className="form-actions" aria-label="切換扶輪年度">
      <Link className="button button-secondary" href={`${basePath}?year=${report.rotaryYearStart - 1}&mode=management`}>← 上一年度</Link>
      <strong>{report.rotaryYearLabel} 扶輪年度</strong>
      {report.rotaryYearStart < currentYear
        ? <Link className="button button-secondary" href={`${basePath}?year=${report.rotaryYearStart + 1}&mode=management`}>下一年度 →</Link>
        : <span className="button button-secondary" aria-disabled="true">目前年度</span>}
    </nav>

    <Notice>扶輪年度固定從 7 月 1 日開始，到隔年 6 月 30 日結束。沖銷的收款不計入已收金額，但歷史紀錄仍保留。</Notice>
    <BlessingIouReport report={report} />
  </div>;
}

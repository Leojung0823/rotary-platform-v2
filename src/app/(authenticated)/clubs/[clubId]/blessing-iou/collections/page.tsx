import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BlessingIouCollections } from "@/components/blessing-iou/blessing-iou-collections";
import { Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { parseBlessingIouCollectionContext } from "@/lib/blessing-iou/collections-contracts";
import { parseCollectionPeriodMonth } from "@/lib/blessing-iou/collections-validation";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { createClient } from "@/lib/supabase/server";

function currentTaipeiMonth() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : new Date().toISOString().slice(0, 7);
}

function normalizedMonth(value: string | undefined) {
  try {
    return parseCollectionPeriodMonth(value ?? currentTaipeiMonth()).slice(0, 7);
  } catch {
    return currentTaipeiMonth();
  }
}

function shiftMonth(value: string, difference: number) {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + difference, 1)).toISOString().slice(0, 7);
}

function displayMonth(value: string) {
  const [year, month] = value.split("-");
  return `${year} 年 ${Number(month)} 月`;
}

export default async function BlessingIouCollectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const [identity, { clubId }, query] = await Promise.all([requireIdentity(), params, searchParams]);
  const [evaluation, collectionsEvaluation] = await Promise.all([
    evaluateCurrentFeatureFlag({ key: "blessing_iou_v1", subjectUuid: identity.id }),
    evaluateCurrentFeatureFlag({ key: "blessing_iou_collections_v1", subjectUuid: identity.id }),
  ]);
  if (!evaluation.enabled || !collectionsEvaluation.enabled) notFound();

  const month = normalizedMonth(query.month);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_blessing_iou_collection_context", {
    p_club_id: clubId,
    p_period_month: `${month}-01`,
  });
  if (error?.code === "42501") redirect("/access-denied");

  let context;
  try {
    context = error ? null : parseBlessingIouCollectionContext(data);
  } catch {
    context = null;
  }

  if (!context) {
    return <div className="page-stack">
      <header className="page-header"><div><p className="eyebrow">祝福 IOU</p><h1>收款管理</h1></div></header>
      <Notice tone="error">目前無法載入本月 IOU 收款資料，請稍後重新整理。</Notice>
    </div>;
  }

  const basePath = `/clubs/${encodeURIComponent(context.clubId)}/blessing-iou/collections`;
  const nextMonth = shiftMonth(context.periodMonth, 1);
  const canOpenNextMonth = nextMonth <= currentTaipeiMonth();
  return <div className="page-stack">
    <header className="page-header">
      <div>
        <Link className="back-link" href={`/clubs/${encodeURIComponent(context.clubId)}/blessing-iou?mode=management`}>← 返回祝福 IOU 管理</Link>
        <p className="eyebrow">{context.clubCode} · 財務管理</p>
        <h1>IOU 收款</h1>
        <p>{context.clubName} · {displayMonth(context.periodMonth)}</p>
      </div>
    </header>

    <nav className="form-actions" aria-label="切換 IOU 月份">
      <Link className="button button-secondary" href={`${basePath}?month=${shiftMonth(context.periodMonth, -1)}&mode=management`}>← 上個月</Link>
      <strong>{displayMonth(context.periodMonth)}</strong>
      {canOpenNextMonth
        ? <Link className="button button-secondary" href={`${basePath}?month=${nextMonth}&mode=management`}>下個月 →</Link>
        : <span className="button button-secondary" aria-disabled="true">已是本月</span>}
    </nav>

    <Notice>
      收款登錄後，社員不能修改或取消該筆祝福。登錄錯誤時請使用「沖銷」保留原紀錄，再重新登錄正確金額。
    </Notice>
    <BlessingIouCollections initialContext={context} />
  </div>;
}

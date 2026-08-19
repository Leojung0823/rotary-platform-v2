import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BlessingIouManagement } from "@/components/blessing-iou/blessing-iou-management";
import { Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { parseBlessingIouManagementContext } from "@/lib/blessing-iou/contracts";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { createClient } from "@/lib/supabase/server";

export default async function BlessingIouManagementPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const [identity, { clubId }] = await Promise.all([requireIdentity(), params]);
  const [evaluation, collectionsEvaluation, reportingEvaluation] = await Promise.all([
    evaluateCurrentFeatureFlag({ key: "blessing_iou_v1", subjectUuid: identity.id }),
    evaluateCurrentFeatureFlag({ key: "blessing_iou_collections_v1", subjectUuid: identity.id }),
    evaluateCurrentFeatureFlag({ key: "blessing_iou_reporting_v1", subjectUuid: identity.id }),
  ]);
  if (!evaluation.enabled) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_blessing_iou_management_context", {
    p_club_id: clubId,
  });
  if (error?.code === "42501") redirect("/access-denied");

  let context;
  try {
    context = error ? null : parseBlessingIouManagementContext(data);
  } catch {
    context = null;
  }

  if (!context) {
    return <div className="page-stack">
      <header className="page-header">
        <div><p className="eyebrow">祝福 IOU</p><h1>幹部管理</h1></div>
      </header>
      <Notice tone="error">目前無法載入這個扶輪社的祝福 IOU 設定，請稍後重新整理。</Notice>
    </div>;
  }

  return <div className="page-stack">
    <header className="page-header">
      <div>
        <p className="eyebrow">{context.clubCode} · 社務管理</p>
        <h1>祝福 IOU</h1>
        <p>{context.clubName}的祝福牆與金額公開設定。</p>
      </div>
      <div className="form-actions">
        {collectionsEvaluation.enabled && <Link
          className="button"
          href={`/clubs/${encodeURIComponent(context.clubId)}/blessing-iou/collections?mode=management`}
        >收款管理</Link>}
        {reportingEvaluation.enabled && <Link
          className="button button-secondary"
          href={`/clubs/${encodeURIComponent(context.clubId)}/blessing-iou/reports?mode=management`}
        >年度統計</Link>}
        <Link
          className="button button-secondary"
          href={`/blessings?clubId=${encodeURIComponent(context.clubId)}&mode=member`}
        >查看社員畫面</Link>
      </div>
    </header>
    <Notice>{collectionsEvaluation.enabled
      ? `收款管理支援單筆、部分與多筆批次登錄；錯帳只能沖銷，不能刪除。${reportingEvaluation.enabled ? "年度統計採 7 月到隔年 6 月的扶輪年度。" : ""}`
      : "祝福牆核心已開放；收款功能目前仍關閉，可先檢查祝福內容與金額隱私設定。"}
    </Notice>
    <BlessingIouManagement initialContext={context} />
  </div>;
}

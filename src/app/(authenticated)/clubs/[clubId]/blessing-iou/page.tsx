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
  const evaluation = await evaluateCurrentFeatureFlag({
    key: "blessing_iou_v1",
    subjectUuid: identity.id,
  });
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
      <Link
        className="button button-secondary"
        href={`/blessings?clubId=${encodeURIComponent(context.clubId)}&mode=member`}
      >查看社員畫面</Link>
    </header>
    <Notice>
      這一版管理祝福內容與承諾金額；收款、部分收款、批次收款與扶輪年度統計會在後續獨立功能中加入。
    </Notice>
    <BlessingIouManagement initialContext={context} />
  </div>;
}

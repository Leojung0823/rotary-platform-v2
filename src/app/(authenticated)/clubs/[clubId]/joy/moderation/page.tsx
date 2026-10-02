import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { JoyModerationQueue } from "@/components/joy-wall/joy-moderation-queue";
import { EmptyState, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { requireClubPermission } from "@/lib/club-permissions.server";
import { parseJoyReports } from "@/lib/joy-wall/contracts";
import { parseJoyClubId } from "@/lib/joy-wall/validation";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { createClient } from "@/lib/supabase/server";

export default async function JoyModerationPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const identity = await requireIdentity();
  const evaluation = await evaluateCurrentFeatureFlag({ key: "joy_wall_v1", subjectUuid: identity.id });
  if (!evaluation.enabled) notFound();
  const { clubId: rawClubId } = await params;
  let clubId: string;
  try { clubId = parseJoyClubId(rawClubId); } catch { notFound(); }
  const query = await searchParams;
  if (query.mode !== "management") {
    redirect(`/clubs/${encodeURIComponent(clubId)}/joy/moderation?mode=management`);
  }
  await requireClubPermission(clubId, "joy.moderate");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_joy_reports", { p_club_id: clubId, p_limit: 50 });
  if (error) return <Notice tone="error">目前無法載入檢舉清單，請稍後再試。</Notice>;
  let reports: ReturnType<typeof parseJoyReports>;
  try {
    reports = parseJoyReports(data);
  } catch {
    return <Notice tone="error">檢舉資料格式不完整，為保護社員隱私目前不顯示內容。</Notice>;
  }
  return <div className="page-stack">
    <header className="page-header">
      <div><p className="eyebrow">社務管理 · 社內互動</p><h1>歡喜牆檢舉</h1><p>處理社員檢舉；處置會留下紀錄，不會無痕刪除內容。</p></div>
      <Link className="button button-secondary" href={`/joy?clubId=${encodeURIComponent(clubId)}&mode=management`}>返回歡喜牆</Link>
    </header>
    {reports.length === 0
      ? <EmptyState title="目前沒有待處理檢舉" body="新收到的檢舉會列在這裡。" />
      : <JoyModerationQueue clubId={clubId} initialReports={reports} />}
  </div>;
}

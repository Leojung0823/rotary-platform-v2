import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { JoySuggestionQueue } from "@/components/joy-wall/joy-suggestion-queue";
import { EmptyState, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { requireClubPermission } from "@/lib/club-permissions.server";
import { parseJoySuggestions } from "@/lib/joy-wall/contracts";
import { parseJoyClubId } from "@/lib/joy-wall/validation";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { createClient } from "@/lib/supabase/server";

export default async function JoySuggestionsPage({
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
    redirect(`/clubs/${encodeURIComponent(clubId)}/joy/suggestions?mode=management`);
  }
  await requireClubPermission(clubId, "joy.moderate");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_joy_suggestions", { p_club_id: clubId, p_limit: 100 });
  if (error) return <Notice tone="error">目前無法載入匿名建議，請稍後再試。</Notice>;
  let suggestions: ReturnType<typeof parseJoySuggestions>;
  try {
    suggestions = parseJoySuggestions(data);
  } catch {
    return <Notice tone="error">建議資料格式不完整，為保護社員隱私目前不顯示內容。</Notice>;
  }
  return <div className="page-stack">
    <header className="page-header">
      <div><p className="eyebrow">社務管理 · 社內互動</p><h1>匿名建議箱</h1>
        <p>查看社員提出的建議並標記處理狀態。這裡不會顯示提交者身分。</p>
      </div>
      <Link className="button button-secondary" href={`/joy?clubId=${encodeURIComponent(clubId)}&mode=management`}>返回歡喜牆</Link>
    </header>
    {suggestions.length === 0
      ? <EmptyState title="目前沒有待處理建議" body="新收到的匿名建議會列在這裡。" />
      : <JoySuggestionQueue clubId={clubId} initialSuggestions={suggestions} />}
  </div>;
}

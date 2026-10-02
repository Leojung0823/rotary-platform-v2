import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { JoyQuestionManager } from "@/components/joy-wall/joy-question-manager";
import { Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { requireClubPermission } from "@/lib/club-permissions.server";
import {
  parseJoyQuestionManagerPage,
  parseJoyQuestionRecipients,
} from "@/lib/joy-wall/contracts";
import { parseJoyClubId } from "@/lib/joy-wall/validation";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { createClient } from "@/lib/supabase/server";

export default async function JoyQuestionsManagementPage({
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
    redirect(`/clubs/${encodeURIComponent(clubId)}/joy/questions?mode=management`);
  }
  await requireClubPermission(clubId, "joy.moderate");

  const supabase = await createClient();
  const [managerResult, recipientsResult] = await Promise.all([
    supabase.rpc("get_joy_question_manager_page", { p_club_id: clubId }),
    supabase.rpc("list_joy_question_recipient_options", { p_club_id: clubId }),
  ]);
  if (managerResult.error || recipientsResult.error) {
    return <div className="page-stack"><header className="page-header">
      <div><p className="eyebrow">社務管理 · 社內互動</p><h1>提問題庫與派發</h1></div>
      <Link className="button button-secondary" href={`/joy?clubId=${encodeURIComponent(clubId)}&mode=management`}>返回歡喜牆</Link>
    </header><Notice tone="error">目前無法載入題庫或社員名單，請稍後再試。</Notice></div>;
  }
  let managerPage: ReturnType<typeof parseJoyQuestionManagerPage>;
  let recipients: ReturnType<typeof parseJoyQuestionRecipients>;
  try {
    managerPage = parseJoyQuestionManagerPage(managerResult.data);
    recipients = parseJoyQuestionRecipients(recipientsResult.data);
  } catch {
    return <div className="page-stack"><Notice tone="error">題庫資料格式不完整，為保護社員資料目前不顯示內容。</Notice></div>;
  }
  return <div className="page-stack">
    <header className="page-header">
      <div><p className="eyebrow">社務管理 · 社內互動</p><h1>提問題庫與派發</h1>
        <p>管理本社可用問題，並為社員各派一題不同的待回答任務。</p></div>
      <Link className="button button-secondary" href={`/joy?clubId=${encodeURIComponent(clubId)}&mode=management`}>返回歡喜牆</Link>
    </header>
    <JoyQuestionManager clubId={clubId} initialPage={managerPage} recipients={recipients} />
  </div>;
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BirthdayCollectionManagement } from "@/components/birthday-collection/birthday-collection-management";
import { Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { parseBirthdayCollectionPageProjection } from "@/lib/birthdays/collection-contracts";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const successMessages: Record<string, string> = {
  question_created: "本社題目已加入題庫。",
  question_updated: "本社題目設定已更新。",
  generated: "本月生日祝福任務已建立；重複執行不會重複派發。",
  generated_notification_skipped: "本月生日祝福任務已建立，但訊息中心目前未開啟；社員仍可從生日祝福徵集頁進入。",
  generation_failed: "題庫不足，本次沒有部分派發；請先補充可用題目。",
  published: "生日祝福已發布。",
  hidden: "這則祝福已隱藏；原作者可以重新送出新的內容。",
};

const errorMessages: Record<string, string> = {
  invalid_input: "輸入內容不完整，請再試一次。",
  question_bank_exhausted: "題庫不足，這次沒有部分派發。",
  already_published: "祝福已發布，不能再修改或刪除。",
  not_ready: "這則祝福目前還不能發布。",
  invalid_question: "題目格式不正確，請檢查題目、語氣與排序。",
  duplicate_question: "題目代碼已存在，請換一個代碼。",
  forbidden: "您目前沒有執行這項操作的權限。",
  feature_disabled: "生日祝福徵集目前尚未開放。",
  notification_failed: "任務已建立，但通知沒有完成；請稍後重試通知。",
  unexpected: "操作沒有完成，請稍後再試。",
};

export default async function BirthdayCollectionManagementPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [identity, { clubId }, query] = await Promise.all([requireIdentity(), params, searchParams]);
  if (!uuidPattern.test(clubId)) notFound();

  const evaluation = await evaluateCurrentFeatureFlag({
    key: "birthday_wishes_collection_v1",
    subjectUuid: identity.id,
  });
  if (!evaluation.enabled) notFound();

  const { data, error } = await (await createClient()).rpc("get_my_birthday_wish_collection_page", {
    p_club_id: clubId,
  });
  if (error?.code === "42501") redirect("/access-denied");
  if (error || !data) {
    return <div className="page-stack">
      <header className="page-header">
        <div><p className="eyebrow">生日祝福 · 社務管理</p><h1>生日祝福徵集</h1></div>
        <Link className="button button-secondary" href={`/birthday-collection?clubId=${encodeURIComponent(clubId)}`}>返回社員頁</Link>
      </header>
      <Notice tone="error">目前無法確認生日祝福徵集權限，請稍後重新整理。</Notice>
    </div>;
  }

  let page;
  try {
    // The manager projection does not need the public wall. Passing an empty
    // second projection keeps this page to one database read and makes the
    // boundary explicit: this route is for management data only.
    page = parseBirthdayCollectionPageProjection(data, []);
  } catch {
    return <div className="page-stack">
      <header className="page-header">
        <div><p className="eyebrow">生日祝福 · 社務管理</p><h1>生日祝福徵集</h1></div>
      </header>
      <Notice tone="error">徵集資料格式不完整，系統已停止顯示。</Notice>
    </div>;
  }

  if (page.clubId.toLowerCase() !== clubId.toLowerCase() || !page.canManage) redirect("/access-denied");

  return <div className="page-stack">
    <header className="page-header">
      <div>
        <p className="eyebrow">生日祝福 · 社務管理</p>
        <h1>生日祝福徵集</h1>
        <p>每位社員每月最多收到一則自動任務；幹部可在這裡派發、審核內容與維護題庫。</p>
      </div>
      <div className="form-actions">
        <Link className="button button-secondary" href={`/birthday-collection?clubId=${encodeURIComponent(page.clubId)}`}>查看社員頁</Link>
        <Link className="button button-secondary" href={`/birthdays?clubId=${encodeURIComponent(page.clubId)}`}>返回生日頁</Link>
      </div>
    </header>
    {query.success && successMessages[query.success] && <Notice tone="success">{successMessages[query.success]}</Notice>}
    {query.error && <Notice tone="error">{errorMessages[query.error] ?? errorMessages.unexpected}</Notice>}
    <BirthdayCollectionManagement page={page} />
  </div>;
}

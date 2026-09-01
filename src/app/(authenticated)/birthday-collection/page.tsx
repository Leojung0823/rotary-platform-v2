import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  declineBirthdayCollectionAssignmentAction,
  deleteBirthdayCollectionSubmissionAction,
  saveBirthdayCollectionSubmissionAction,
} from "@/app/birthday-collection-actions";
import { Badge, Button, Card, EmptyState, Field, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { parseBirthdayCollectionPageProjection } from "@/lib/birthdays/collection-contracts";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { createClient } from "@/lib/supabase/server";
import styles from "./birthday-collection.module.css";

const successMessages: Record<string, string> = {
  submitted: "生日祝福已送出，等候幹部發布。",
  deleted: "尚未發布的生日祝福已刪除。",
  published: "生日祝福已發布，社員現在可以看到了。",
  hidden: "這則祝福已隱藏；原作者可以重新送出新的內容。",
  declined: "您已婉拒這一則自動派發的生日祝福任務。",
  question_created: "本社題目已加入題庫。",
  question_updated: "本社題目設定已更新。",
  generated: "本月生日祝福任務已建立；重複執行不會重複派發。",
  generated_notification_skipped: "本月生日祝福任務已建立，但訊息中心目前未開啟；社員仍可從生日祝福徵集頁進入。",
  generation_failed: "題庫不足，本次沒有部分派發；請先補充可用題目。",
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

function submissionLabel(status: string | null) {
  return ({ submitted: "已送出", published: "已發布", hidden: "已隱藏", deleted: "已刪除" } as Record<string, string>)[status ?? ""] ?? "尚未送出";
}

export default async function BirthdayCollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ clubId?: string; mode?: string; success?: string; error?: string }>;
}) {
  const [identity, query] = await Promise.all([requireIdentity(), searchParams]);
  const evaluation = await evaluateCurrentFeatureFlag({
    key: "birthday_wishes_collection_v1",
    subjectUuid: identity.id,
  });
  if (!evaluation.enabled || !query.clubId) notFound();

  const supabase = await createClient();
  // Keep a bookmarked manager URL as a redirect only. Do not fetch the public
  // wall on this path; the canonical manager route will repeat its own exact
  // tenant and permission checks before rendering manager data.
  if (query.mode === "management") {
    const { data: managerData, error: managerError } = await supabase.rpc("get_my_birthday_wish_collection_page", {
      p_club_id: query.clubId,
    });
    if (managerError || !managerData) redirect("/access-denied");
    try {
      const managerPage = parseBirthdayCollectionPageProjection(managerData, []);
      if (managerPage.clubId.toLowerCase() !== query.clubId.toLowerCase() || !managerPage.canManage) redirect("/access-denied");
      redirect(`/clubs/${encodeURIComponent(managerPage.clubId)}/birthday-collection?mode=management`);
    } catch {
      redirect("/access-denied");
    }
  }

  const [{ data, error }, { data: publishedData, error: publishedError }] = await Promise.all([
    supabase.rpc("get_my_birthday_wish_collection_page", { p_club_id: query.clubId }),
    supabase.rpc("list_published_birthday_wish_submissions", { p_club_id: query.clubId }),
  ]);
  if (error || !data || publishedError || !publishedData) {
    return <div className="page-stack"><CollectionHeader clubId={query.clubId} /><Notice tone="error">目前無法確認生日祝福徵集權限，請稍後重新整理。</Notice></div>;
  }

  let page;
  try {
    page = parseBirthdayCollectionPageProjection(data, publishedData);
  } catch {
    return <div className="page-stack"><CollectionHeader clubId={query.clubId} /><Notice tone="error">徵集資料格式不完整，系統已停止顯示。</Notice></div>;
  }

  return <div className="page-stack">
    <CollectionHeader clubId={page.clubId} canManage={page.canManage} />
    {query.success && successMessages[query.success] && <Notice tone="success">{successMessages[query.success]}</Notice>}
    {query.error && <Notice tone="error">{errorMessages[query.error] ?? errorMessages.unexpected}</Notice>}

    <section>
      <div className="section-heading"><div><p className="eyebrow">只派一則</p><h2>我的生日祝福任務</h2></div><span>{page.myAssignments.length} 則任務</span></div>
      {page.myAssignments.length === 0 ? <EmptyState title="目前沒有派發給您的任務" body="幹部建立本月徵集後，這裡會出現一則專屬題目；您仍可自行到生日頁祝福更多社員。" /> : <div className={styles.assignmentList}>
        {page.myAssignments.map((assignment) => <Card key={assignment.participantId} className={styles.assignmentCard}>
          <div className={styles.cardHeading}>
            <div><p className="eyebrow">{assignment.birthdayDate}</p><h3>寫給 {assignment.recipientName}</h3></div>
            <Badge tone={assignment.submissionStatus === "published" ? "success" : assignment.submissionStatus === "hidden" ? "warning" : "neutral"}>{submissionLabel(assignment.submissionStatus)}</Badge>
          </div>
          <p className={styles.question}>{assignment.questionPrompt}</p>
          {assignment.canEdit ? <form action={saveBirthdayCollectionSubmissionAction} className="form-stack">
            <input type="hidden" name="clubId" value={page.clubId} />
            <input type="hidden" name="participantId" value={assignment.participantId} />
            <Field label="你的生日祝福" hint={assignment.submissionStatus === "hidden" ? "上一版已被幹部隱藏，請重新寫一則；這會保留原本的處理紀錄。" : "最多 500 字；送出後在發布前仍可修改或刪除。"}>
              <textarea className="input" name="content" rows={5} maxLength={500} required defaultValue={assignment.content ?? ""} placeholder="寫下你想對壽星說的話……" />
            </Field>
            <div className={styles.formActions}><Button type="submit">{assignment.submissionStatus === "hidden" ? "重新送出祝福" : assignment.content ? "更新祝福" : "送出祝福"}</Button>{assignment.submissionStatus === "submitted" && <button className="button button-secondary" type="submit" formAction={deleteBirthdayCollectionSubmissionAction}>刪除未發布祝福</button>}</div>
          </form> : assignment.content ? <p className={styles.content}>{assignment.content}</p> : <Notice>這則任務目前沒有可編輯的內容。</Notice>}
          {assignment.canDecline && <form action={declineBirthdayCollectionAssignmentAction}>
            <input type="hidden" name="clubId" value={page.clubId} />
            <input type="hidden" name="participantId" value={assignment.participantId} />
            <button className="link-button" type="submit">婉拒這一則自動任務</button>
          </form>}
        </Card>)}
      </div>}
    </section>

    <section>
      <div className="section-heading"><div><p className="eyebrow">已發布</p><h2>生日祝福牆</h2></div><span>{page.publishedWishes.length} 則祝福</span></div>
      {page.publishedWishes.length === 0 ? <EmptyState title="還沒有已發布的徵集祝福" body="幹部發布後，這裡會顯示內容；壽星和一般社員看不到作者姓名。" /> : <div className={styles.publishedList}>
        {page.publishedWishes.map((wish) => <Card key={wish.submissionId} className={styles.publishedCard}>
          <div className={styles.cardHeading}><div><strong>{wish.authorIsHidden ? "匿名祝福者" : wish.authorName ?? "匿名祝福者"}</strong><small>祝福 {wish.recipientName} · {wish.birthdayDate}</small></div></div>
          <p className={styles.content}>{wish.content}</p>
        </Card>)}
      </div>}
    </section>

  </div>;
}

function CollectionHeader({ clubId, canManage = false }: { clubId: string; canManage?: boolean }) {
  return <header className="page-header"><div><p className="eyebrow">生日祝福</p><h1>生日祝福徵集</h1><p>系統每月最多派給您一則任務；您仍可自行祝福更多社員。壽星與一般社員看不到作者，幹部才能管理作者。</p></div><div className="form-actions">{canManage && <a className="button" href={`/clubs/${encodeURIComponent(clubId)}/birthday-collection?mode=management`}>幹部管理</a>}<Link className="button button-secondary" href={`/birthdays?clubId=${clubId}`}>返回生日頁</Link></div></header>;
}

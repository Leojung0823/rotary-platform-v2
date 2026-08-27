import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createBirthdayCollectionQuestionAction,
  declineBirthdayCollectionAssignmentAction,
  deleteBirthdayCollectionSubmissionAction,
  hideBirthdayCollectionSubmissionAction,
  publishBirthdayCollectionSubmissionAction,
  runBirthdayCollectionMonthAction,
  saveBirthdayCollectionSubmissionAction,
  updateBirthdayCollectionQuestionAction,
} from "@/app/birthday-collection-actions";
import { Badge, Button, Card, EmptyState, Field, Input, Notice } from "@/components/ui";
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

function taipeiPeriod() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  return {
    year: Number(parts.find((part) => part.type === "year")?.value ?? 2026),
    month: Number(parts.find((part) => part.type === "month")?.value ?? 1),
  };
}

function campaignStatusLabel(status: string) {
  return ({ draft: "準備中", collecting: "徵集中", published: "已發布", closed: "已結束", hidden: "已隱藏" } as Record<string, string>)[status] ?? status;
}

function submissionLabel(status: string | null) {
  return ({ submitted: "已送出", published: "已發布", hidden: "已隱藏", deleted: "已刪除" } as Record<string, string>)[status ?? ""] ?? "尚未送出";
}

function questionToneLabel(tone: string) {
  return ({ warm: "溫馨", humorous: "幽默", moving: "感人" } as Record<string, string>)[tone] ?? tone;
}

function eventLabel(eventType: string) {
  return ({
    submitted: "送出",
    updated: "修改",
    resubmitted: "重新送出",
    deleted: "刪除未發布內容",
    published: "發布",
    hidden: "隱藏已發布內容",
    declined: "婉拒任務",
  } as Record<string, string>)[eventType] ?? eventType;
}

export default async function BirthdayCollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ clubId?: string; success?: string; error?: string }>;
}) {
  const [identity, query] = await Promise.all([requireIdentity(), searchParams]);
  const evaluation = await evaluateCurrentFeatureFlag({
    key: "birthday_wishes_collection_v1",
    subjectUuid: identity.id,
  });
  if (!evaluation.enabled || !query.clubId) notFound();

  const supabase = await createClient();
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

  const period = taipeiPeriod();
  return <div className="page-stack">
    <CollectionHeader clubId={page.clubId} />
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

    {page.canManage && <section>
      <div className="section-heading"><div><p className="eyebrow">幹部工作台</p><h2>生日徵集狀態</h2></div><span>{page.campaigns.length} 位壽星</span></div>
      <Card className={styles.managerCard}>
        <p>系統會在壽星生日前自動建立指定月份任務；每位社員最多一則，同批題目不重複。需要補跑時，幹部仍可手動建立或重跑月份任務。</p>
        <form action={runBirthdayCollectionMonthAction} className="form-grid">
          <input type="hidden" name="clubId" value={page.clubId} />
          <Field label="生日年份"><Input name="birthdayYear" type="number" min={2000} max={2200} defaultValue={period.year} required /></Field>
          <Field label="生日月份"><Input name="birthdayMonth" type="number" min={1} max={12} defaultValue={period.month} required /></Field>
          <Button type="submit">建立／重跑本月任務</Button>
        </form>
      </Card>
      {page.campaigns.length === 0 ? <EmptyState title="尚未建立生日徵集" body="選擇月份後建立任務，系統會依題庫與社員數量安全分配。" /> : <div className={styles.campaignList}>
        {page.campaigns.map((campaign) => <Card key={campaign.campaignId} className={styles.campaignCard}>
          <div className={styles.cardHeading}><div><p className="eyebrow">{campaign.birthdayDate}</p><h3>{campaign.recipientName}</h3></div><Badge tone={campaign.campaignStatus === "collecting" ? "warning" : "success"}>{campaignStatusLabel(campaign.campaignStatus)}</Badge></div>
          <p>{campaign.submittedCount} / {campaign.participantCount} 位社員已送出祝福</p>
          <div className={styles.progress} aria-label={`${campaign.submittedCount} / ${campaign.participantCount} 已送出`}><span style={{ width: `${campaign.participantCount ? Math.min(100, campaign.submittedCount / campaign.participantCount * 100) : 0}%` }} /></div>
        </Card>)}
      </div>}
    </section>}

    {page.canManage && <section>
      <div className="section-heading"><div><p className="eyebrow">作者僅幹部可見</p><h2>祝福內容管理</h2></div><span>{page.participants.length} 則任務</span></div>
      {page.participants.length === 0 ? <EmptyState title="尚無任務內容" body="建立月份任務後，這裡會顯示社員提交狀態與作者，社員端不會看到作者姓名。" /> : <div className={styles.participantList}>
        {page.participants.map((participant) => <Card key={participant.participantId} className={styles.participantCard}>
          <div className={styles.cardHeading}><div><strong>{participant.assigneeName}</strong><small>{participant.questionPrompt}</small></div><Badge tone={participant.submissionStatus === "published" ? "success" : participant.submissionStatus === "hidden" ? "warning" : participant.submissionStatus ? "neutral" : "neutral"}>{submissionLabel(participant.submissionStatus)}</Badge></div>
          {participant.content && <p className={styles.content}>{participant.content}</p>}
          <small>作者：{participant.authorName ?? "尚未提交"}</small>
          {participant.submissionStatus === "submitted" && <form action={publishBirthdayCollectionSubmissionAction}>
            <input type="hidden" name="clubId" value={page.clubId} />
            <input type="hidden" name="participantId" value={participant.participantId} />
            <Button type="submit">發布這則祝福</Button>
          </form>}
          {participant.submissionStatus === "published" && <form action={hideBirthdayCollectionSubmissionAction}>
            <input type="hidden" name="clubId" value={page.clubId} />
            <input type="hidden" name="participantId" value={participant.participantId} />
            <button className="button button-secondary" type="submit">隱藏並要求重新送出</button>
          </form>}
          <details className={styles.history}>
            <summary>處理紀錄（{participant.processingHistory.length} 筆）</summary>
            {participant.processingHistory.length === 0 ? <p className={styles.hint}>尚無處理紀錄。</p> : <ol>
              {participant.processingHistory.map((event) => <li key={event.id}>
                <strong>{eventLabel(event.eventType)}</strong>
                <small>{event.actorName ?? "系統"} · {new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Taipei" }).format(new Date(event.createdAt))}</small>
                {event.contentSnapshot && <p>{event.contentSnapshot}</p>}
              </li>)}
            </ol>}
          </details>
        </Card>)}
      </div>}
    </section>}

    {page.canManage && <details className={styles.questionBank}>
      <summary>管理題庫（平台 {page.questionBank.platform.length} 題／本社 {page.questionBank.club.length} 題）</summary>
      <p className={styles.hint}>平台題庫只能查看；本社題庫可以新增、修改、排序或暫停使用。已派發的任務會保留當時的題目。</p>
      <div className={styles.questionSection}>
        <h3>新增本社題目</h3>
        <form action={createBirthdayCollectionQuestionAction} className={styles.questionEditor}>
          <input type="hidden" name="clubId" value={page.clubId} />
          <Field label="題目代碼" hint="英文小寫、數字與底線，例如 club_q_101"><Input name="questionKey" required maxLength={64} placeholder="club_q_101" /></Field>
          <Field label="題目內容"><Input name="questionPrompt" required maxLength={300} placeholder="寫給壽星的一句話……" /></Field>
          <Field label="路線"><select className="input" name="tone" defaultValue="warm"><option value="warm">溫馨</option><option value="humorous">幽默</option><option value="moving">感人</option></select></Field>
          <Field label="排序"><Input name="sortOrder" type="number" min={0} max={10000} defaultValue={100} required /></Field>
          <Button type="submit">加入本社題庫</Button>
        </form>
      </div>
      <div className={styles.questionSection}>
        <h3>本社題庫</h3>
        {page.questionBank.club.length === 0 ? <p className={styles.hint}>目前還沒有本社自訂題目。</p> : <div className={styles.questionList}>
          {page.questionBank.club.map((question) => <form key={question.id} action={updateBirthdayCollectionQuestionAction} className={styles.questionEditor}>
            <input type="hidden" name="clubId" value={page.clubId} />
            <input type="hidden" name="questionId" value={question.id} />
            <strong>{question.questionKey} · {questionToneLabel(question.tone)}</strong>
            <Field label="題目內容"><Input name="questionPrompt" required maxLength={300} defaultValue={question.prompt} /></Field>
            <Field label="路線"><select className="input" name="tone" defaultValue={question.tone}><option value="warm">溫馨</option><option value="humorous">幽默</option><option value="moving">感人</option></select></Field>
            <Field label="排序"><Input name="sortOrder" type="number" min={0} max={10000} defaultValue={question.sortOrder} required /></Field>
            <label className={styles.checkbox}><input type="checkbox" name="isEnabled" defaultChecked={question.isEnabled} /> 可派發</label>
            <Button type="submit">儲存題目</Button>
          </form>)}
        </div>}
      </div>
      <div className={styles.questionSection}>
        <h3>平台題庫（唯讀）</h3>
        <ol className={styles.questionList}>
          {page.questionBank.platform.filter((question) => question.isEnabled).map((question) => <li key={question.id}>{question.prompt} <small>（{questionToneLabel(question.tone)}）</small></li>)}
        </ol>
      </div>
    </details>}
  </div>;
}

function CollectionHeader({ clubId }: { clubId: string }) {
  return <header className="page-header"><div><p className="eyebrow">生日祝福</p><h1>生日祝福徵集</h1><p>系統每月最多派給您一則任務；您仍可自行祝福更多社員。壽星與一般社員看不到作者，幹部才能管理作者。</p></div><Link className="button button-secondary" href={`/birthdays?clubId=${clubId}`}>返回生日頁</Link></header>;
}

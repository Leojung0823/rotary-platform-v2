import {
  createBirthdayCollectionQuestionAction,
  hideBirthdayCollectionSubmissionAction,
  publishBirthdayCollectionSubmissionAction,
  runBirthdayCollectionMonthAction,
  updateBirthdayCollectionQuestionAction,
} from "@/app/birthday-collection-actions";
import { Badge, Button, Card, EmptyState, Field, Input } from "@/components/ui";
import type { BirthdayCollectionPage } from "@/lib/birthdays/collection-contracts";
import styles from "@/app/(authenticated)/birthday-collection/birthday-collection.module.css";

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
  return ({
    draft: "準備中",
    collecting: "徵集中",
    published: "已發布",
    closed: "已結束",
    hidden: "已隱藏",
  } as Record<string, string>)[status] ?? status;
}

function submissionLabel(status: string | null) {
  return ({
    submitted: "已送出",
    published: "已發布",
    hidden: "已隱藏",
    deleted: "已刪除",
  } as Record<string, string>)[status ?? ""] ?? "尚未送出";
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

export function BirthdayCollectionManagement({ page }: { page: BirthdayCollectionPage }) {
  const period = taipeiPeriod();

  return <div className="page-stack" data-testid="birthday-collection-management">
    <section>
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
    </section>

    <section>
      <div className="section-heading"><div><p className="eyebrow">作者僅幹部可見</p><h2>祝福內容管理</h2></div><span>{page.participants.length} 則任務</span></div>
      {page.participants.length === 0 ? <EmptyState title="尚無任務內容" body="建立月份任務後，這裡會顯示社員提交狀態與作者，社員端不會看到作者姓名。" /> : <div className={styles.participantList}>
        {page.participants.map((participant) => <Card key={participant.participantId} className={styles.participantCard}>
          <div className={styles.cardHeading}><div><strong>{participant.assigneeName}</strong><small>{participant.questionPrompt}</small></div><Badge tone={participant.submissionStatus === "published" ? "success" : participant.submissionStatus === "hidden" ? "warning" : "neutral"}>{submissionLabel(participant.submissionStatus)}</Badge></div>
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
    </section>

    <section>
      <div className="section-heading"><div><p className="eyebrow">幹部設定</p><h2>題庫管理</h2></div><span>{page.questionBank.platform.length + page.questionBank.club.length} 題</span></div>
      <details className={styles.questionBank} open>
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
      </details>
    </section>
  </div>;
}

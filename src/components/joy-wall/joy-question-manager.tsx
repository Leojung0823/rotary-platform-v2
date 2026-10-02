"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  JoyQuestionBatchDetail,
  JoyQuestionManagerPage,
  JoyQuestionPrompt,
  JoyQuestionRecipient,
} from "@/lib/joy-wall/contracts";
import {
  parseJoyQuestionBatchDetail,
  parseJoyQuestionPrompt,
} from "@/lib/joy-wall/contracts";
import styles from "./joy-question-manager.module.css";

async function readData(response: Response): Promise<unknown> {
  const payload = await response.json().catch(() => null) as { data?: unknown } | null;
  if (!response.ok || !payload || !("data" in payload)) throw new Error("request_failed");
  return payload.data;
}

function formattedDate(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Taipei",
  }).format(new Date(value));
}

function taiwanToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Taipei",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function JoyQuestionManager({
  clubId,
  initialPage,
  recipients,
}: {
  clubId: string;
  initialPage: JoyQuestionManagerPage;
  recipients: readonly JoyQuestionRecipient[];
}) {
  const router = useRouter();
  const requestIdRef = useRef<string | null>(null);
  const [promptText, setPromptText] = useState("");
  const [batchTitle, setBatchTitle] = useState("");
  const [batchDueOn, setBatchDueOn] = useState("");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openBatch, setOpenBatch] = useState<string | null>(null);
  const [batchDetail, setBatchDetail] = useState<JoyQuestionBatchDetail | null>(null);

  const visibleRecipients = recipients.filter((recipient) =>
    recipient.display_name.toLocaleLowerCase().includes(recipientSearch.trim().toLocaleLowerCase()),
  );
  const selectedCount = selectedIds.size;
  const activeCount = initialPage.distinct_active_prompt_count;
  const selectionHasEnoughPrompts = selectedCount > 0 && selectedCount <= activeCount;

  function toggleRecipient(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < 250) next.add(id);
      return next;
    });
  }

  function toggleVisibleRecipients(select: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (!select) {
        for (const recipient of visibleRecipients) next.delete(recipient.membership_id);
        return next;
      }
      for (const recipient of visibleRecipients) {
        if (next.size >= 250) break;
        next.add(recipient.membership_id);
      }
      return next;
    });
  }

  async function savePrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingKey("new-prompt"); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/v1/joy/question-bank?club_id=${encodeURIComponent(clubId)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptText }),
      });
      parseJoyQuestionPrompt(await readData(response));
      setPromptText(""); setNotice("新題目已加入本社題庫。"); router.refresh();
    } catch {
      setError("題目沒有新增。請確認內容至少 5 個字、最多 200 字，且沒有重複後再試。");
    } finally { setPendingKey(null); }
  }

  async function updatePrompt(prompt: JoyQuestionPrompt, form: HTMLFormElement) {
    const data = new FormData(form);
    const nextPromptText = String(data.get("promptText") ?? "");
    const isActive = data.get("isActive") === "on";
    const sortOrder = Number(data.get("sortOrder"));
    setPendingKey(prompt.id); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/v1/joy/question-bank/${encodeURIComponent(prompt.id)}?club_id=${encodeURIComponent(clubId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptText: nextPromptText, isActive, sortOrder }),
      });
      parseJoyQuestionPrompt(await readData(response));
      setNotice("題庫設定已更新。"); router.refresh();
    } catch {
      setError("題目沒有更新。可能是內容重複、長度不符，或連線中斷；請重新整理確認目前狀態。");
    } finally { setPendingKey(null); }
  }

  async function dispatchBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectionHasEnoughPrompts) return;
    const deadlineDescription = batchDueOn ? `，截止日為 ${batchDueOn}（台北時間）` : "，不設定截止日";
    const confirmed = window.confirm(`確定要派發「${batchTitle.trim()}」給 ${selectedCount} 位社員${deadlineDescription}嗎？每位社員會收到一題不同的私密待辦。`);
    if (!confirmed) return;
    requestIdRef.current ??= crypto.randomUUID();
    setPendingKey("dispatch"); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/v1/joy/question-batches?club_id=${encodeURIComponent(clubId)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: batchTitle,
          recipientMembershipIds: [...selectedIds],
          requestId: requestIdRef.current,
          dueOn: batchDueOn || null,
        }),
      });
      await readData(response);
      requestIdRef.current = null;
      setSelectedIds(new Set()); setBatchTitle(""); setBatchDueOn("");
      setNotice(`已派發給 ${selectedCount} 位社員；每人收到一題不同的私密待辦。`);
      router.refresh();
    } catch {
      setError("派發結果尚未確認。請勿另開新批次；重新按一次會使用同一個安全識別碼，不會重複派發。");
    } finally { setPendingKey(null); }
  }

  async function toggleBatch(batchId: string) {
    if (openBatch === batchId) { setOpenBatch(null); setBatchDetail(null); return; }
    setOpenBatch(batchId); setBatchDetail(null); setError(null);
    try {
      const response = await fetch(`/api/v1/joy/question-batches/${encodeURIComponent(batchId)}?club_id=${encodeURIComponent(clubId)}`);
      setBatchDetail(parseJoyQuestionBatchDetail(await readData(response)));
    } catch {
      setError("這批派發明細目前無法載入，請稍後再試。");
    }
  }

  return <div className={styles.layout}>
    <section className={styles.panel} aria-labelledby="joy-question-bank-title">
      <header className={styles.sectionHeader}>
        <div><p className="eyebrow">社務管理 · 社內互動</p><h2 id="joy-question-bank-title">提問題庫</h2></div>
        <span className={styles.count}>{activeCount} 題可用</span>
      </header>
      <p className={styles.help}>平台題目不能修改；本社新增的題目可編輯或停用。每次派發時，系統會從可用題目中為社員隨機挑選不同題目。</p>
      <form className={styles.newPrompt} onSubmit={(event) => void savePrompt(event)}>
        <label className={styles.field} htmlFor="new-joy-question">新增本社題目
          <textarea id="new-joy-question" value={promptText} onChange={(event) => setPromptText(event.target.value)}
            maxLength={200} minLength={5} rows={2} required placeholder="例如：今年哪一次服務，最讓你感受到團隊的力量？" />
        </label>
        <div className={styles.formFooter}><span>{Array.from(promptText).length}/200 字</span>
          <button type="submit" disabled={pendingKey === "new-prompt"}>{pendingKey === "new-prompt" ? "新增中…" : "加入題庫"}</button></div>
      </form>
      <div className={styles.promptList} aria-label="題庫內容">
        {initialPage.prompts.map((prompt) => <form key={prompt.id} className={styles.promptCard}
          onSubmit={(event) => { event.preventDefault(); void updatePrompt(prompt, event.currentTarget); }}>
          <div className={styles.promptMeta}><span className={prompt.source === "platform" ? styles.platformTag : styles.clubTag}>
            {prompt.source === "platform" ? "平台題目" : "本社題目"}</span>
            {!prompt.is_active && <span className={styles.inactiveTag}>已停用</span>}
          </div>
          <label className={styles.field}>題目內容
            <textarea name="promptText" defaultValue={prompt.prompt_text} maxLength={200} minLength={5} rows={2}
              readOnly={!prompt.can_edit} />
          </label>
          {prompt.can_edit && <div className={styles.promptControls}>
            <label className={styles.check}><input type="checkbox" name="isActive" defaultChecked={prompt.is_active} />派題時可使用</label>
            <label className={styles.order}>排序<input type="number" name="sortOrder" min={0} max={10000} step={1} defaultValue={prompt.sort_order} /></label>
            <button type="submit" disabled={pendingKey === prompt.id}>{pendingKey === prompt.id ? "儲存中…" : "儲存"}</button>
          </div>}
        </form>)}
      </div>
    </section>

    <section className={styles.panel} aria-labelledby="joy-question-dispatch-title">
      <header className={styles.sectionHeader}><div><p className="eyebrow">每人一題 · 私密待辦</p><h2 id="joy-question-dispatch-title">批次派發不同題目</h2></div></header>
      <p className={styles.help}>每位被選社員會收到一則待回答提問；同一批不會重複題目。社員的回答仍依歡喜牆原有的私密與權限規則處理，不會公開給其他社員。</p>
      <form className={styles.dispatchForm} onSubmit={(event) => void dispatchBatch(event)}>
        <label className={styles.field} htmlFor="joy-question-batch-title">這批任務的名稱
          <input id="joy-question-batch-title" value={batchTitle} onChange={(event) => setBatchTitle(event.target.value)}
            maxLength={100} required placeholder="例如：十月社友交流提問" />
        </label>
        <label className={styles.field} htmlFor="joy-question-batch-due-on">回答截止日（台北日期，選填）
          <input id="joy-question-batch-due-on" type="date" min={taiwanToday()} value={batchDueOn}
            onChange={(event) => setBatchDueOn(event.target.value)} />
          <span className={styles.help}>當日結束前都能回答；逾期後待辦仍會保留，也仍可回答。</span>
        </label>
        <div className={styles.recipientHeader}>
          <label className={styles.search}>搜尋社員
            <input type="search" value={recipientSearch} onChange={(event) => setRecipientSearch(event.target.value)} placeholder="輸入社員姓名" />
          </label>
          <div className={styles.selectionTools}>
            <button type="button" onClick={() => toggleVisibleRecipients(true)}>選取畫面中的社員</button>
            <button type="button" onClick={() => toggleVisibleRecipients(false)}>取消畫面中的選取</button>
          </div>
        </div>
        <fieldset className={styles.recipients}>
          <legend>派給哪些社員（最多 250 位）</legend>
          {visibleRecipients.length === 0 ? <p className={styles.empty}>沒有符合的社員。</p> : visibleRecipients.map((recipient) => (
            <label key={recipient.membership_id} className={styles.recipient}>
              <input type="checkbox" checked={selectedIds.has(recipient.membership_id)}
                onChange={() => toggleRecipient(recipient.membership_id)}
                disabled={!selectedIds.has(recipient.membership_id) && selectedIds.size >= 250} />
              <span>{recipient.display_name}</span>
            </label>
          ))}
        </fieldset>
        <div className={styles.dispatchFooter}>
          <p aria-live="polite">已選 {selectedCount} 位；目前有 {activeCount} 道可用且不重複的題目。</p>
          <button type="submit" disabled={pendingKey === "dispatch" || !selectionHasEnoughPrompts || batchTitle.trim().length === 0}>
            {pendingKey === "dispatch" ? "派發中…" : `派發給 ${selectedCount} 位社員`}
          </button>
        </div>
        {selectedCount > activeCount && <p className={styles.warning} role="status">題目數不足。請先新增或啟用本社題目，至少需要 {selectedCount} 道不重複題目。</p>}
      </form>
    </section>

    <section className={styles.panel} aria-labelledby="joy-question-batch-history-title">
      <header className={styles.sectionHeader}><div><p className="eyebrow">只顯示回答狀態，不顯示回答內容</p><h2 id="joy-question-batch-history-title">最近派發紀錄</h2></div></header>
      {initialPage.batches.length === 0 ? <p className={styles.empty}>目前還沒有批次派發紀錄。</p> :
        <div className={styles.batchList}>{initialPage.batches.map((batch) => <article key={batch.id} className={styles.batchCard}>
          <div className={styles.batchSummary}><div><h3>{batch.title}</h3><time dateTime={batch.created_at}>{formattedDate(batch.created_at)}</time>
            <p>{batch.due_on ? `回答截止：${batch.due_on}（台北）` : "沒有設定回答期限"}</p></div>
            <p>{batch.answered_count}/{batch.assignment_count} 已回答 · {batch.unavailable_count} 則已隱藏或不可用</p>
            <button type="button" aria-expanded={openBatch === batch.id} onClick={() => void toggleBatch(batch.id)}>
              {openBatch === batch.id ? "收合明細" : "查看明細"}
            </button></div>
          {openBatch === batch.id && <div className={styles.batchDetail}>
            {!batchDetail ? <p>載入明細中…</p> : <ul>{batchDetail.assignments.map((assignment) => <li key={assignment.post_id}>
              <div><strong>{assignment.recipient_display_name}</strong><span>{assignment.prompt_text}</span></div>
              <span className={assignment.answered ? styles.done : styles.pending}>
                {!assignment.available ? "已隱藏／不可用" : assignment.answered ? "已回答" : "待回答"}
              </span>
            </li>)}</ul>}
          </div>}
        </article>)}</div>}
    </section>

    {notice && <p role="status" className={styles.success}>{notice}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </div>;
}

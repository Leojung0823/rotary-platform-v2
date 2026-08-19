"use client";

import { useMemo, useState, type FormEvent } from "react";
import type {
  BlessingIouCollectionContext,
  BlessingIouCollectionEntry,
  BlessingIouCollectionRecord,
} from "@/lib/blessing-iou/collections-contracts";
import styles from "./blessing-iou-collections.module.css";

type ApiEnvelope<T> = { data?: T; error?: string };

class CollectionRequestError extends Error {
  constructor(readonly status: number) {
    super("collection_request_failed");
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || payload?.data === undefined) throw new CollectionRequestError(response.status);
  return payload.data;
}

const moneyFormatter = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const methodLabels = {
  cash: "現金",
  transfer: "轉帳",
  check: "支票",
  other: "其他",
} as const;

const statusLabels = {
  unpaid: "未收款",
  partial: "部分收款",
  paid: "已收清",
} as const;

function localToday() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function groupEntries(entries: readonly BlessingIouCollectionEntry[]) {
  const groups = new Map<string, {
    membershipId: string;
    displayName: string;
    entries: BlessingIouCollectionEntry[];
    pledgedAmount: number;
    receivedAmount: number;
    outstandingAmount: number;
  }>();
  for (const entry of entries) {
    const current = groups.get(entry.authorMembershipId) ?? {
      membershipId: entry.authorMembershipId,
      displayName: entry.authorDisplayName,
      entries: [],
      pledgedAmount: 0,
      receivedAmount: 0,
      outstandingAmount: 0,
    };
    current.entries.push(entry);
    current.pledgedAmount += entry.pledgedAmount;
    current.receivedAmount += entry.receivedAmount;
    current.outstandingAmount += entry.outstandingAmount;
    groups.set(entry.authorMembershipId, current);
  }
  return [...groups.values()];
}

function CollectionHistoryRow({
  record,
  pending,
  onReverse,
}: {
  record: BlessingIouCollectionRecord;
  pending: boolean;
  onReverse: (record: BlessingIouCollectionRecord) => void;
}) {
  const reversed = record.collectionStatus === "reversed";
  return <tr>
    <td><strong>{record.authorDisplayName}</strong><small>{formatDate(record.receivedOn)}</small></td>
    <td>{moneyFormatter.format(record.amountReceived)}</td>
    <td>{methodLabels[record.paymentMethod]}</td>
    <td>{record.referenceNote ?? "—"}</td>
    <td>
      <span className={reversed ? styles.reversedBadge : styles.postedBadge}>
        {reversed ? "已沖銷" : "有效"}
      </span>
      {reversed && <small>{record.reversalReason}</small>}
    </td>
    <td>{!reversed && <button
      type="button"
      className={styles.reverseButton}
      disabled={pending}
      onClick={() => onReverse(record)}
    >{pending ? "處理中…" : "沖銷"}</button>}</td>
  </tr>;
}

export function BlessingIouCollections({
  initialContext,
}: {
  initialContext: BlessingIouCollectionContext;
}) {
  const [context, setContext] = useState(initialContext);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [receivedOn, setReceivedOn] = useState(localToday);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [referenceNote, setReferenceNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingCollectionId, setPendingCollectionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const groups = useMemo(() => groupEntries(context.entries), [context.entries]);

  function updateAmount(entryId: string, value: string) {
    setAmounts((current) => ({ ...current, [entryId]: value }));
  }

  function selectedItems() {
    return context.entries.flatMap((entry) => {
      const raw = amounts[entry.entryId]?.trim() ?? "";
      if (raw === "") return [];
      if (!/^\d+$/u.test(raw)) throw new Error("invalid_amount");
      const amount = Number(raw);
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > entry.outstandingAmount) {
        throw new Error("invalid_amount");
      }
      return [{ entryId: entry.entryId, amount }];
    });
  }

  async function recordCollections(event: FormEvent) {
    event.preventDefault();
    let items;
    try {
      items = selectedItems();
    } catch {
      setMessage("每筆收款必須是 1 元以上的整數，而且不能超過未收金額。");
      return;
    }
    if (items.length === 0) {
      setMessage("請至少在一筆 IOU 填入本次收到的金額。");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const query = new URLSearchParams({ club_id: context.clubId });
      const response = await fetch(`/api/v1/blessing-iou/collections?${query.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodMonth: context.periodMonth,
          receivedOn,
          paymentMethod,
          referenceNote: referenceNote.trim() || null,
          items,
        }),
      });
      const updated = await readResponse<BlessingIouCollectionContext>(response);
      setContext(updated);
      setAmounts({});
      setReferenceNote("");
      setMessage(`已登錄 ${items.length} 筆收款。`);
    } catch (error) {
      if (error instanceof CollectionRequestError && (error.status === 401 || error.status === 403)) {
        setMessage("登入狀態已失效，或您沒有本社收款權限。");
      } else if (error instanceof CollectionRequestError && error.status === 409) {
        setMessage("資料已被其他幹部更新，請重新整理後再試。");
      } else {
        setMessage("收款沒有登錄成功，請確認金額後再試。");
      }
    } finally {
      setSaving(false);
    }
  }

  async function reverseCollection(record: BlessingIouCollectionRecord) {
    const supplied = window.prompt("請填寫沖銷原因（至少 2 個字）。原收款紀錄會保留：");
    if (supplied === null) return;
    const reason = supplied.trim();
    if (Array.from(reason).length < 2 || Array.from(reason).length > 300) {
      setMessage("沖銷原因需為 2～300 個字。");
      return;
    }
    setPendingCollectionId(record.collectionId);
    setMessage(null);
    try {
      const query = new URLSearchParams({ club_id: context.clubId });
      const response = await fetch(
        `/api/v1/blessing-iou/collections/${encodeURIComponent(record.collectionId)}?${query.toString()}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ periodMonth: context.periodMonth, reason }),
        },
      );
      const updated = await readResponse<BlessingIouCollectionContext>(response);
      setContext(updated);
      setMessage("收款已沖銷，原紀錄仍保留供日後核對。");
    } catch (error) {
      if (error instanceof CollectionRequestError && (error.status === 401 || error.status === 403)) {
        setMessage("登入狀態已失效，或您沒有本社收款權限。");
      } else {
        setMessage("沖銷沒有完成，請重新整理後再試。");
      }
    } finally {
      setPendingCollectionId(null);
    }
  }

  const summary = context.summary;
  return <div className={styles.collections}>
    <section className={styles.metrics} aria-label="本月 IOU 摘要">
      <div><span>本月承諾</span><strong>{moneyFormatter.format(summary.pledgedAmount)}</strong><small>{summary.entryCount} 筆</small></div>
      <div><span>目前已收</span><strong>{moneyFormatter.format(summary.receivedAmount)}</strong><small>{summary.paidEntryCount} 筆收清</small></div>
      <div><span>尚未收款</span><strong>{moneyFormatter.format(summary.outstandingAmount)}</strong><small>{summary.partialEntryCount} 筆部分收款</small></div>
    </section>

    {message && <p className={styles.message} role="status">{message}</p>}

    <form className={styles.collectionForm} onSubmit={recordCollections}>
      <section className={styles.receiptSettings} aria-labelledby="receipt-settings-title">
        <div><p className={styles.eyebrow}>本次收款</p><h2 id="receipt-settings-title">收款資料</h2></div>
        <div className={styles.settingsGrid}>
          <label><span>收款日期</span><input type="date" value={receivedOn} onChange={(event) => setReceivedOn(event.target.value)} required disabled={saving} /></label>
          <label><span>收款方式</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} disabled={saving}>
            <option value="cash">現金</option>
            <option value="transfer">轉帳</option>
            <option value="check">支票</option>
            <option value="other">其他</option>
          </select></label>
          <label className={styles.noteField}><span>核對備註（選填）</span><input value={referenceNote} onChange={(event) => setReferenceNote(event.target.value)} maxLength={300} placeholder="例如：轉帳末五碼 12345" disabled={saving} /></label>
        </div>
        <p>在下方一筆或多筆 IOU 填金額後，可一次登錄。少於未收金額就是部分收款。</p>
      </section>

      <section aria-labelledby="member-iou-title">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>社員清單</p><h2 id="member-iou-title">本月每位社員 IOU</h2></div></div>
        {groups.length === 0 ? <div className={styles.empty}><strong>本月沒有捐款承諾</strong><span>只有填寫金額的祝福會出現在收款清單。</span></div>
          : <div className={styles.memberList}>{groups.map((group) => <article className={styles.memberCard} key={group.membershipId}>
            <header>
              <div><h3>{group.displayName}</h3><span>{group.entries.length} 筆 IOU</span></div>
              <dl><div><dt>承諾</dt><dd>{moneyFormatter.format(group.pledgedAmount)}</dd></div><div><dt>已收</dt><dd>{moneyFormatter.format(group.receivedAmount)}</dd></div><div><dt>未收</dt><dd>{moneyFormatter.format(group.outstandingAmount)}</dd></div></dl>
            </header>
            <div className={styles.entryList}>{group.entries.map((entry) => <div className={styles.entryRow} key={entry.entryId}>
              <div className={styles.entryCopy}>
                <span className={styles[`${entry.collectionStatus}Badge`]}>{statusLabels[entry.collectionStatus]}</span>
                <p>{entry.blessingText}</p>
                <small>{formatDate(entry.pledgedOn)} · 承諾 {moneyFormatter.format(entry.pledgedAmount)} · 已收 {moneyFormatter.format(entry.receivedAmount)}</small>
              </div>
              {entry.outstandingAmount > 0 ? <label className={styles.amountField}>
                <span>本次收到</span>
                <span><b>NT$</b><input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max={entry.outstandingAmount}
                  step="1"
                  value={amounts[entry.entryId] ?? ""}
                  onChange={(event) => updateAmount(entry.entryId, event.target.value)}
                  placeholder={String(entry.outstandingAmount)}
                  disabled={saving}
                /></span>
                <button type="button" onClick={() => updateAmount(entry.entryId, String(entry.outstandingAmount))} disabled={saving}>填入全部未收</button>
              </label> : <strong className={styles.settled}>已收清</strong>}
            </div>)}</div>
          </article>)}</div>}
      </section>

      {summary.outstandingAmount > 0 && <div className={styles.submitBar}>
        <span>可同時登錄不同社員、多筆 IOU。</span>
        <button type="submit" disabled={saving}>{saving ? "登錄中…" : "登錄本次收款"}</button>
      </div>}
    </form>

    <section aria-labelledby="collection-history-title">
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>會計軌跡</p><h2 id="collection-history-title">收款與沖銷紀錄</h2></div></div>
      {context.collections.length === 0 ? <div className={styles.empty}><strong>目前沒有收款紀錄</strong><span>完成第一筆收款後會顯示在這裡。</span></div>
        : <div className={styles.tableWrap}><table>
          <thead><tr><th>社員／日期</th><th>金額</th><th>方式</th><th>備註</th><th>狀態</th><th>操作</th></tr></thead>
          <tbody>{context.collections.map((record) => <CollectionHistoryRow
            key={record.collectionId}
            record={record}
            pending={pendingCollectionId === record.collectionId}
            onReverse={(item) => void reverseCollection(item)}
          />)}</tbody>
        </table></div>}
    </section>
  </div>;
}

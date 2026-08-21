"use client";

/* eslint-disable @next/next/no-img-element, react-hooks/set-state-in-effect */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { BlessingIouEntry } from "@/lib/blessing-iou/contracts";
import { BLESSING_IOU_MAX_AMOUNT, BLESSING_IOU_TEXT_MAX_CODE_POINTS } from "@/lib/blessing-iou/validation";
import styles from "./blessing-wall.module.css";

type BlessingList = {
  entries: BlessingIouEntry[];
  next_cursor: string | null;
  viewer_can_manage: boolean;
};

type ApiEnvelope<T> = { data?: T; error?: string };

class BlessingRequestError extends Error {
  constructor(readonly status: number) {
    super("blessing_iou_request_failed");
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || payload?.data === undefined) {
    throw new BlessingRequestError(response.status);
  }
  return payload.data;
}

function blessingEndpoint(clubId: string, entryId?: string, parameters?: URLSearchParams) {
  const query = parameters ?? new URLSearchParams();
  query.set("club_id", clubId);
  const path = entryId
    ? `/api/v1/blessing-iou/entries/${encodeURIComponent(entryId)}`
    : "/api/v1/blessing-iou/entries";
  return `${path}?${query.toString()}`;
}

function codePointLength(value: string) {
  return Array.from(value.replace(/\r\n?/gu, "\n").trim()).length;
}

function parseAmountInput(value: string) {
  if (value.trim() === "") return null;
  if (!/^\d+$/u.test(value)) return undefined;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 1 && amount <= BLESSING_IOU_MAX_AMOUNT
    ? amount
    : undefined;
}

function entryValidationMessage(text: string, amountInput: string) {
  const textLength = codePointLength(text);
  // The text is optional, so a member may post a pledge alone -- but an entry
  // carrying neither words nor an amount would say nothing at all.
  if (textLength === 0 && amountInput.trim() === "") {
    return "請填寫祝福的話或捐款金額，至少其中一項。";
  }
  if (textLength > BLESSING_IOU_TEXT_MAX_CODE_POINTS) {
    return `祝福最多 ${BLESSING_IOU_TEXT_MAX_CODE_POINTS} 個字。`;
  }
  if (parseAmountInput(amountInput) === undefined) {
    return "捐款金額請填 1 元以上的整數，或留白。";
  }
  return null;
}

const dateFormatter = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const currencyFormatter = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
});

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "時間未知" : dateFormatter.format(date);
}

function safeAvatarUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function Avatar({ entry }: { entry: BlessingIouEntry }) {
  const [failed, setFailed] = useState(false);
  const url = safeAvatarUrl(entry.authorAvatarUrl);
  const initial = entry.authorDisplayName.trim().slice(0, 1) || "祝";
  return <span className={styles.avatar} aria-hidden="true">
    <span>{initial}</span>
    {url && !failed && <img
      src={url}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />}
  </span>;
}

function AmountSummary({ entry }: { entry: BlessingIouEntry }) {
  if (!entry.hasPledge) return <span className={styles.blessingOnly}>純祝福</span>;
  if (entry.pledgedAmount === null) {
    return <span className={styles.privateAmount}>已填捐款金額 · 金額不公開</span>;
  }
  if (entry.amountIsPublic) {
    return <span className={styles.publicAmount}>祝福捐款 {currencyFormatter.format(entry.pledgedAmount)}</span>;
  }
  return <span className={styles.privateAmount}>
    {entry.canEdit ? "我的捐款" : "捐款"} {currencyFormatter.format(entry.pledgedAmount)} · 不公開
  </span>;
}

function EntryFields({
  idPrefix,
  text,
  amountInput,
  hideAmount,
  allowPublicAmounts,
  disabled,
  onTextChange,
  onAmountChange,
  onHideAmountChange,
}: {
  idPrefix: string;
  text: string;
  amountInput: string;
  hideAmount: boolean;
  allowPublicAmounts: boolean;
  disabled: boolean;
  onTextChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onHideAmountChange: (value: boolean) => void;
}) {
  const textLength = codePointLength(text);
  const hasAmount = amountInput.trim() !== "";
  return <div className={styles.fields}>
    <label htmlFor={`${idPrefix}-text`}>
      <span>祝福的話（選填）</span>
      <textarea
        id={`${idPrefix}-text`}
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        rows={4}
        maxLength={2000}
        placeholder="例如：祝福本月壽星平安健康、事事順心！留白也可以，只留捐款金額。"
        disabled={disabled}
        aria-invalid={textLength > BLESSING_IOU_TEXT_MAX_CODE_POINTS}
      />
      <small className={textLength > BLESSING_IOU_TEXT_MAX_CODE_POINTS ? styles.overLimit : undefined}>
        {textLength} / {BLESSING_IOU_TEXT_MAX_CODE_POINTS}
      </small>
    </label>
    <label htmlFor={`${idPrefix}-amount`}>
      <span>希望捐贈金額（選填）</span>
      <span className={styles.amountInput}>
        <b>NT$</b>
        <input
          id={`${idPrefix}-amount`}
          type="number"
          inputMode="numeric"
          min="1"
          max={BLESSING_IOU_MAX_AMOUNT}
          step="1"
          value={amountInput}
          onChange={(event) => onAmountChange(event.target.value)}
          placeholder="不捐款可留白"
          disabled={disabled}
        />
      </span>
    </label>
    {allowPublicAmounts
      ? <label className={hasAmount ? styles.privacyChoice : styles.privacyChoicePending}>
          {/* Always rendered, not revealed once an amount is typed: a member
              told they may hide the amount scans the form for the control, and
              a choice that only appears after filling a different field reads
              as a choice that does not exist. It stays disabled until there is
              an amount to hide, which is the only state where it means
              anything. */}
          <input
            type="checkbox"
            checked={hideAmount}
            onChange={(event) => onHideAmountChange(event.target.checked)}
            disabled={disabled || !hasAmount}
          />
          <span>
            <strong>隱藏我的金額</strong>
            <small>{hasAmount
              ? "勾選後，其他社員只知道您有填捐款，不會看到金額。"
              : "填入上方金額後可以選擇。未填金額時不會顯示任何捐款資訊。"}</small>
          </span>
        </label>
      : <p className={styles.privacyNotice}>本社目前不公開捐款金額；只有本人與授權幹部看得到。</p>}
  </div>;
}

function LoadingCards() {
  return <div className={styles.list} aria-busy="true" aria-live="polite">
    <span className="sr-only">正在載入祝福</span>
    {[0, 1].map((item) => <div className={styles.loadingCard} key={item}>
      <span className="skeleton skeleton-eyebrow" />
      <span className="skeleton skeleton-card-title" />
      <span className="skeleton skeleton-copy skeleton-copy-wide" />
      <span className="skeleton skeleton-copy" />
    </div>)}
  </div>;
}

export function BlessingWall({
  clubId,
  allowPublicAmounts,
  canCreate = true,
}: {
  clubId: string;
  allowPublicAmounts: boolean;
  canCreate?: boolean;
}) {
  const [entries, setEntries] = useState<BlessingIouEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [hideAmount, setHideAmount] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [pendingEntryId, setPendingEntryId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingAmount, setEditingAmount] = useState("");
  const [editingHideAmount, setEditingHideAmount] = useState(true);
  const [stateMessage, setStateMessage] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const handleError = useCallback((error: unknown) => {
    if (error instanceof BlessingRequestError && (error.status === 401 || error.status === 403)) {
      setSessionExpired(true);
      setStateMessage("登入狀態已失效，或您沒有這個扶輪社的使用權限。請重新登入或切換社別。");
      return;
    }
    if (error instanceof BlessingRequestError && error.status === 409) {
      setStateMessage("這筆祝福目前不能修改或刪除，請重新整理後確認狀態。");
      return;
    }
    setStateMessage("操作未完成，請稍後再試。");
  }, []);

  const loadEntries = useCallback(async (nextCursor: string | null, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setStateMessage(null);
    try {
      const query = new URLSearchParams({ limit: "20" });
      if (nextCursor) query.set("cursor", nextCursor);
      const response = await fetch(blessingEndpoint(clubId, undefined, query), { cache: "no-store" });
      const data = await readResponse<BlessingList>(response);
      setEntries((current) => append ? [...current, ...data.entries] : data.entries);
      setCursor(data.next_cursor);
    } catch (error) {
      handleError(error);
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, [clubId, handleError]);

  useEffect(() => {
    let cancelled = false;
    setEntries([]);
    setCursor(null);
    setLoading(true);
    setSessionExpired(false);

    async function loadInitialEntries() {
      try {
        const query = new URLSearchParams({ limit: "20" });
        const response = await fetch(blessingEndpoint(clubId, undefined, query), { cache: "no-store" });
        const data = await readResponse<BlessingList>(response);
        if (!cancelled) {
          setEntries(data.entries);
          setCursor(data.next_cursor);
        }
      } catch (error) {
        if (!cancelled) handleError(error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitialEntries();
    return () => { cancelled = true; };
  }, [clubId, handleError]);

  async function publish(event: FormEvent) {
    event.preventDefault();
    const invalid = entryValidationMessage(text, amountInput);
    if (invalid) { setStateMessage(invalid); return; }
    setPublishing(true);
    setStateMessage(null);
    try {
      const response = await fetch(blessingEndpoint(clubId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blessingText: text,
          pledgedAmount: parseAmountInput(amountInput),
          hideAmount: allowPublicAmounts ? hideAmount : true,
        }),
      });
      const entry = await readResponse<BlessingIouEntry>(response);
      setEntries((current) => [entry, ...current]);
      setText("");
      setAmountInput("");
      setHideAmount(true);
      setStateMessage("祝福已送出。社員都看得到祝福內容；金額依您的選擇顯示。");
    } catch (error) {
      handleError(error);
    } finally {
      setPublishing(false);
    }
  }

  function beginEdit(entry: BlessingIouEntry) {
    setEditingEntryId(entry.id);
    setEditingText(entry.blessingText);
    setEditingAmount(entry.pledgedAmount === null ? "" : String(entry.pledgedAmount));
    setEditingHideAmount(!entry.amountIsPublic);
    setStateMessage(null);
  }

  async function saveEdit(entryId: string) {
    const invalid = entryValidationMessage(editingText, editingAmount);
    if (invalid) { setStateMessage(invalid); return; }
    setPendingEntryId(entryId);
    setStateMessage(null);
    try {
      const response = await fetch(blessingEndpoint(clubId, entryId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blessingText: editingText,
          pledgedAmount: parseAmountInput(editingAmount),
          hideAmount: allowPublicAmounts ? editingHideAmount : true,
        }),
      });
      const updated = await readResponse<BlessingIouEntry>(response);
      setEntries((current) => current.map((entry) => entry.id === entryId ? updated : entry));
      setEditingEntryId(null);
      setStateMessage("祝福已更新。");
    } catch (error) {
      handleError(error);
    } finally {
      setPendingEntryId(null);
    }
  }

  async function remove(entry: BlessingIouEntry) {
    let reason: string | null = null;
    if (entry.canEdit) {
      if (!window.confirm("確定要刪除這筆祝福嗎？刪除後不會再顯示。")) return;
    } else {
      const supplied = window.prompt("請填寫幹部刪除原因（至少 2 個字）：");
      if (supplied === null) return;
      reason = supplied.trim();
      if (codePointLength(reason) < 2 || codePointLength(reason) > 300) {
        setStateMessage("幹部刪除原因需為 2～300 個字。");
        return;
      }
    }
    setPendingEntryId(entry.id);
    setStateMessage(null);
    try {
      const response = await fetch(blessingEndpoint(clubId, entry.id), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      await readResponse<{ deleted: true }>(response);
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      if (editingEntryId === entry.id) setEditingEntryId(null);
      setStateMessage("祝福已刪除。");
    } catch (error) {
      handleError(error);
    } finally {
      setPendingEntryId(null);
    }
  }

  return <div className={styles.wall}>
    {canCreate && <section className={styles.composer} aria-labelledby="new-blessing-title">
      <div>
        <p className={styles.eyebrow}>傳遞心意</p>
        <h2 id="new-blessing-title">寫一則祝福</h2>
        <p>祝福內容會讓本社社員看見；捐款金額可以不填。</p>
      </div>
      <form onSubmit={publish}>
        <EntryFields
          idPrefix="new-blessing"
          text={text}
          amountInput={amountInput}
          hideAmount={hideAmount}
          allowPublicAmounts={allowPublicAmounts}
          disabled={publishing || sessionExpired}
          onTextChange={setText}
          onAmountChange={setAmountInput}
          onHideAmountChange={setHideAmount}
        />
        <div className={styles.formActions}>
          <button type="submit" disabled={publishing || sessionExpired}>
            {publishing ? "送出中…" : "送出祝福"}
          </button>
        </div>
      </form>
    </section>}

    {stateMessage && <div className={sessionExpired ? styles.forbidden : styles.message} role="status">
      {stateMessage}
    </div>}

    <section aria-labelledby="latest-blessings-title">
      <div className={styles.listHeading}>
        <div><p className={styles.eyebrow}>祝福牆</p><h2 id="latest-blessings-title">大家的祝福</h2></div>
        <button className={styles.secondaryButton} onClick={() => void loadEntries(null, false)} disabled={loading}>
          重新整理
        </button>
      </div>

      {loading ? <LoadingCards /> : entries.length === 0
        ? <div className={styles.empty}><strong>目前還沒有祝福</strong><span>送出第一則祝福，把心意分享給大家。</span></div>
        : <div className={styles.list}>{entries.map((entry) => {
          const editing = editingEntryId === entry.id;
          const pending = pendingEntryId === entry.id;
          const edited = entry.updatedAt !== entry.createdAt;
          return <article className={styles.entry} key={entry.id}>
            <header>
              <Avatar entry={entry} />
              <div>
                <strong>{entry.authorDisplayName}</strong>
                <span>{formatTime(entry.createdAt)}{edited ? " · 已編輯" : ""}</span>
              </div>
            </header>
            {editing ? <div className={styles.editor}>
              <EntryFields
                idPrefix={`edit-${entry.id}`}
                text={editingText}
                amountInput={editingAmount}
                hideAmount={editingHideAmount}
                allowPublicAmounts={allowPublicAmounts}
                disabled={pending}
                onTextChange={setEditingText}
                onAmountChange={setEditingAmount}
                onHideAmountChange={setEditingHideAmount}
              />
              <div className={styles.editorActions}>
                <button className={styles.secondaryButton} onClick={() => setEditingEntryId(null)} disabled={pending}>取消</button>
                <button onClick={() => void saveEdit(entry.id)} disabled={pending}>{pending ? "儲存中…" : "儲存修改"}</button>
              </div>
            </div> : <>
              <p className={styles.content}>{entry.blessingText}</p>
              <AmountSummary entry={entry} />
            </>}
            {!editing && (entry.canEdit || entry.canDelete) && <footer>
              {entry.canEdit && <button className={styles.textButton} onClick={() => beginEdit(entry)} disabled={pending}>編輯</button>}
              {entry.canDelete && <button className={styles.dangerButton} onClick={() => void remove(entry)} disabled={pending}>
                {pending ? "處理中…" : entry.canEdit ? "刪除" : "幹部刪除"}
              </button>}
            </footer>}
          </article>;
        })}</div>}

      {cursor && !loading && <div className={styles.loadMore}>
        <button className={styles.secondaryButton} onClick={() => void loadEntries(cursor, true)} disabled={loadingMore}>
          {loadingMore ? "載入中…" : "載入更多祝福"}
        </button>
      </div>}
    </section>
  </div>;
}

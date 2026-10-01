"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  archiveClubMessageAction,
  cancelScheduledClubMessageAction,
  markClubMessageReadAction,
  publishClubMessageDraftAction,
  saveClubMessageDraftAction,
  setClubMessagePinnedAction,
  sendClubMessageAction,
  withdrawClubMessageAction,
} from "@/app/message-center-actions";
import { AudiencePicker, type AudienceMember, type AudienceTag } from "@/components/audience/audience-picker";
import { emptyAudienceSelection, type AudienceSelection } from "@/lib/audience/selection";
import { describeMessagePushOutcome } from "@/lib/line/message-push-outcome";
import type {
  ClubMessage,
  ClubMessageLifecycle,
  MessageDeliveries,
} from "@/lib/message-center/contracts";
import styles from "./message-center.module.css";
import { APP_TIME_ZONE } from "@/lib/time";

// Mirrored from the server-side validator rather than imported: that module
// pulls in the cursor codec, which is Node-only, and this component ships to
// the browser. The database enforces both limits regardless.
const MESSAGE_TITLE_MAX_CODE_POINTS = 120;
const MESSAGE_BODY_MAX_CODE_POINTS = 4000;

type Inbox = {
  messages: ClubMessage[];
  pinned_messages: ClubMessage[];
  unread_count: number;
  next_cursor: string | null;
};
type ApiEnvelope<T> = { data?: T; error?: string };

class MessageRequestError extends Error {
  constructor(readonly status: number) {
    super("message_request_failed");
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || !payload?.data) throw new MessageRequestError(response.status);
  return payload.data;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "時間未知";
  return new Intl.DateTimeFormat("zh-TW", { timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function audienceLabel(message: { audience_kind: ClubMessage["audience_kind"] }, tagNames: string[] = []) {
  if (message.audience_kind === "everyone") return "全社";
  if (message.audience_kind === "members") return "指定社員";
  return tagNames.length > 0 ? tagNames.join("、") : "指定標籤";
}

function actionStatusLabel(status: ClubMessage["action_status"]) {
  if (status === null) return "";
  return ({
    pending: "待完成",
    completed: "已完成",
    declined: "已婉拒",
    needs_resubmission: "需要重新送出",
    disabled: "已停用",
  } as Record<Exclude<ClubMessage["action_status"], null>, string>)[status];
}

function endpoint(clubId: string, path = "") {
  return `/api/v1/messages${path}?club_id=${encodeURIComponent(clubId)}`;
}

function Deliveries({ clubId, messageId }: { clubId: string; messageId: string }) {
  const [deliveries, setDeliveries] = useState<MessageDeliveries | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(endpoint(clubId, `/${messageId}/deliveries`), { cache: "no-store" })
      .then((response) => readResponse<MessageDeliveries>(response))
      .then((data) => { if (!cancelled) { setDeliveries(data); setFailed(false); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [clubId, messageId]);

  if (failed) return <p className={styles.hint}>目前無法載入已讀名單，請稍後再試。</p>;
  if (!deliveries) return <p className={styles.hint}>載入已讀名單…</p>;

  const unread = deliveries.recipients.filter((recipient) => recipient.read_at === null);
  return <div className={styles.deliveries}>
    {/* Who has not read it is the actionable half; naming them is the point of
        the view, so it is listed first and in full. */}
    {unread.length === 0
      ? <p className={styles.hint}>所有收件的社員都已讀。</p>
      : <p className={styles.hint}>尚未讀取（{unread.length} 位）：{unread.map((recipient) => recipient.display_name).join("、")}</p>}
  </div>;
}

function lifecycleStatusLabel(status: ClubMessageLifecycle["status"]) {
  return ({
    draft: "草稿",
    scheduled: "已排程",
    active: "已發布",
    cancelled: "已取消",
    archived: "已封存",
    expired: "已到期",
    failed: "排程失敗",
  } as const)[status];
}

function localDateTimeValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function SentMessage({
  clubId,
  message,
  onUpdate,
  onRemove,
  onEditDraft,
}: {
  clubId: string;
  message: ClubMessageLifecycle;
  onUpdate: (message: ClubMessageLifecycle) => void;
  onRemove: (messageId: string) => void;
  onEditDraft: (message: ClubMessageLifecycle) => void;
}) {
  const [showDeliveries, setShowDeliveries] = useState(false);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = async (operation: () => Promise<{ ok: boolean; message?: ClubMessageLifecycle }>) => {
    setWorking(true);
    setFailed(false);
    const result = await operation();
    if (result.ok && result.message) onUpdate(result.message);
    else setFailed(true);
    setWorking(false);
  };

  const withdraw = async () => {
    setWorking(true);
    setFailed(false);
    const result = await withdrawClubMessageAction(clubId, message.id);
    if (result.ok) onRemove(message.id);
    else setFailed(true);
    setWorking(false);
  };

  const dateLabel = message.status === "scheduled"
    ? `預計發布 ${message.scheduled_at ? formatTime(message.scheduled_at) : "時間未知"}`
    : message.published_at
      ? `發布於 ${formatTime(message.published_at)}`
      : `建立於 ${formatTime(message.created_at)}`;

  return <article className={styles.sentItem}>
    <div className={styles.sentHeading}>
      <strong>{message.title} <span className={styles.status}>{lifecycleStatusLabel(message.status)}</span></strong>
      <span className={styles.meta}>
        {dateLabel} · 發給 {audienceLabel(message, message.audience_tag_names)}
        {message.status !== "draft" && <> · 已讀 {message.read_count}／{message.recipient_count}</>}
        {message.expires_at && <> · 到期 {formatTime(message.expires_at)}</>}
      </span>
    </div>
    <p className={styles.body}>{message.body}</p>
    <div className={styles.sentActions}>
      {message.status === "draft" && <>
        <button type="button" className="link-button" onClick={() => onEditDraft(message)} disabled={working}>
          編輯草稿
        </button>
        <button type="button" className="link-button" onClick={() => run(() => publishClubMessageDraftAction(clubId, message.id))} disabled={working}>
          {working ? "發布中…" : "立即發布"}
        </button>
      </>}
      {message.status === "scheduled" && <button
        type="button" className="link-button"
        onClick={() => run(() => cancelScheduledClubMessageAction(clubId, message.id))}
        disabled={working}
      >{working ? "取消中…" : "取消排程"}</button>}
      {message.status === "active" && <>
        <button type="button" className="link-button" onClick={() => setShowDeliveries((open) => !open)}>
          {showDeliveries ? "收合已讀名單" : "查看誰還沒讀"}
        </button>
        <button type="button" className="link-button" onClick={() => run(() => setClubMessagePinnedAction(
          clubId, message.id, message.pinned_at === null,
        ))} disabled={working}>
          {message.pinned_at ? "取消置頂" : "置頂公告"}
        </button>
        <button type="button" className="link-button" onClick={() => run(() => archiveClubMessageAction(clubId, message.id))} disabled={working}>
          {working ? "封存中…" : "封存"}
        </button>
        <button type="button" className="link-button" onClick={withdraw} disabled={working}>
          {working ? "收回中…" : "收回訊息"}
        </button>
      </>}
    </div>
    {failed && <p className={styles.error} role="alert">更新沒有完成，請稍後再試。</p>}
    {showDeliveries && message.status === "active" && <Deliveries clubId={clubId} messageId={message.id} />}
  </article>;
}

export function MessageCenter({
  clubId,
  initialInbox,
  canSend = false,
  audienceTags = [],
  audienceMembers = [],
  initialLifecycle = [],
  lifecycleUnavailable = false,
}: {
  clubId: string;
  initialInbox: Inbox;
  /** True only for an officer who may address the club. */
  canSend?: boolean;
  audienceTags?: readonly AudienceTag[];
  audienceMembers?: readonly AudienceMember[];
  initialLifecycle?: readonly ClubMessageLifecycle[];
  lifecycleUnavailable?: boolean;
}) {
  const [messages, setMessages] = useState<ClubMessage[]>(initialInbox.messages);
  const [pinnedMessages, setPinnedMessages] = useState<ClubMessage[]>(initialInbox.pinned_messages);
  const [cursor, setCursor] = useState<string | null>(initialInbox.next_cursor);
  const [unreadCount, setUnreadCount] = useState(initialInbox.unread_count);
  const [openMessageId, setOpenMessageId] = useState<string | null>(null);
  const [lifecycle, setLifecycle] = useState<ClubMessageLifecycle[]>([...initialLifecycle]);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [editingDraft, setEditingDraft] = useState<ClubMessageLifecycle | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [stateMessage, setStateMessage] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const draftFormRef = useRef<HTMLFormElement>(null);

  const handleError = useCallback((error: unknown) => {
    if (error instanceof MessageRequestError && (error.status === 401 || error.status === 403)) {
      setSessionExpired(true);
      setStateMessage("登入狀態已失效，或您不是這個扶輪社的有效社員。請重新登入或切換社別。");
      return;
    }
    setStateMessage("操作未完成，請稍後再試。");
  }, []);

  const openMessage = async (message: ClubMessage) => {
    const opening = openMessageId === message.id ? null : message.id;
    setOpenMessageId(opening);
    if (opening === null || message.read_at !== null) return;

    // Read state follows the member actually opening the message, so it is
    // recorded when the body is revealed rather than when the list renders. A
    // failure leaves it unread, which is the honest outcome.
    const result = await markClubMessageReadAction(clubId, message.id);
    if (!result.ok) {
      setStateMessage(result.reason === "forbidden"
        ? "登入狀態已失效，或您不是這個扶輪社的有效社員。請重新登入或切換社別。"
        : "操作未完成，請稍後再試。");
      setSessionExpired(result.reason === "forbidden");
      return;
    }
    setMessages((current) => current.map((entry) => (
      entry.id === message.id ? { ...entry, read_at: result.readAt } : entry
    )));
    setPinnedMessages((current) => current.map((entry) => (
      entry.id === message.id ? { ...entry, read_at: result.readAt } : entry
    )));
    setUnreadCount(result.unreadCount);
  };

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    setStateMessage(null);
    try {
      const response = await fetch(
        `${endpoint(clubId)}&limit=20&cursor=${encodeURIComponent(cursor)}`,
        { cache: "no-store" },
      );
      const data = await readResponse<Inbox>(response);
      setMessages((current) => [...current, ...data.messages]);
      setCursor(data.next_cursor);
      setUnreadCount(data.unread_count);
    } catch (error) {
      handleError(error);
    } finally {
      setLoadingMore(false);
    }
  };

  const upsertLifecycle = (message: ClubMessageLifecycle) => {
    setLifecycle((current) => [message, ...current.filter((entry) => entry.id !== message.id)]);
  };

  const send = async (formData: FormData) => {
    setSending(true);
    setStateMessage(null);
    const result = await sendClubMessageAction(formData);
    setSending(false);

    if (!result.ok) {
      setStateMessage(result.reason === "invalid_input"
        ? "標題與內容都要填，標題最多 120 字、內容最多 4000 字。"
        : result.reason === "forbidden"
          ? "您沒有在這個扶輪社發布訊息的權限。"
          : "訊息沒有送出，請稍後再試。");
      setSessionExpired(result.reason === "forbidden");
      return;
    }

    const now = result.message.published_at;
    upsertLifecycle({
      id: result.message.id,
      title: result.message.title,
      body: result.message.body,
      status: "active",
      audience_kind: result.message.audience_kind,
      scheduled_at: null,
      published_at: now,
      expires_at: null,
      pinned_at: null,
      created_at: now,
      updated_at: now,
      recipient_count: 0,
      read_count: 0,
      audience_tag_ids: [],
      audience_membership_ids: [],
      audience_tag_names: [],
    });
    // The counts come from the server on the next load; saying "sent" with a
    // recipient count we made up would be worse than saying nothing.
    setStateMessage(`訊息已送出。重新整理可以看到送達與已讀人數。${describeMessagePushOutcome(result.linePush)}`);
  };

  const saveDraft = async (intent: "save" | "schedule" | "publish") => {
    const form = draftFormRef.current;
    if (!form) return;

    const formData = new FormData(form);
    formData.set("clubId", clubId);
    formData.set("messageId", editingDraft?.id ?? "");
    formData.set("draftIntent", intent);
    const expiresLocal = String(formData.get("expiresLocal") ?? "");
    const scheduledLocal = String(formData.get("scheduledLocal") ?? "");
    const toIso = (value: string) => {
      if (!value) return "";
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    };
    const expiresAt = toIso(expiresLocal);
    const scheduledAt = intent === "schedule" ? toIso(scheduledLocal) : "";
    if (expiresAt === null || scheduledAt === null || (intent === "schedule" && !scheduledAt)) {
      setStateMessage("請確認到期時間與排程時間有效；排程時間必須填寫且在未來。 ");
      return;
    }
    formData.set("expiresAt", expiresAt);
    formData.set("scheduledAt", scheduledAt);

    setSavingDraft(true);
    setStateMessage(null);
    const result = await saveClubMessageDraftAction(formData);
    setSavingDraft(false);
    if (!result.ok) {
      if (result.persisted) upsertLifecycle(result.persisted);
      setStateMessage(result.reason === "invalid_input"
        ? "標題、內容或時間格式不正確，請檢查後再試。"
        : result.reason === "forbidden"
          ? "您沒有管理這個扶輪社公告的權限。"
          : result.reason === "schedule_failed"
            ? "草稿已保留，但排程沒有完成；請修正時間後再試。"
            : "公告沒有儲存，請稍後再試。");
      setSessionExpired(result.reason === "forbidden");
      return;
    }

    upsertLifecycle(result.message);
    setEditingDraft(null);
    form.reset();
    setStateMessage(intent === "save"
      ? "草稿已儲存。"
      : intent === "schedule"
        ? "已排定發布；這則公告只會出現在 App，不會發送 LINE 或 Email。"
        : "草稿已發布到 App。");
  };

  const editingAudience: AudienceSelection = editingDraft
    ? {
        mode: editingDraft.audience_kind === "tags"
          ? "tags"
          : editingDraft.audience_kind === "members" ? "members" : "everyone",
        tagIds: editingDraft.audience_tag_ids,
        membershipIds: editingDraft.audience_membership_ids,
      }
    : emptyAudienceSelection;

  const pinnedIds = new Set(pinnedMessages.map((message) => message.id));
  const visibleMessages = messages.filter((message) => !pinnedIds.has(message.id));

  return <div className={styles.center}>
    {stateMessage && <p className={sessionExpired ? styles.error : styles.notice} role="status">{stateMessage}</p>}

    {canSend && <section className={styles.composer}>
      <div className="section-heading">
        <div><p className="eyebrow">社務管理</p><h2>公告管理</h2></div>
      </div>
      <p className={styles.hint}>直接發布會嘗試 LINE 推播；草稿與排程公告只會出現在 App，不會發送 LINE 或 Email。</p>
      <form
        key={editingDraft?.id ?? "new-draft"}
        ref={draftFormRef}
        className="form-stack"
        action={send}
      >
        <input type="hidden" name="clubId" value={clubId} />
        <input type="hidden" name="messageId" value={editingDraft?.id ?? ""} />
        <label className="field">
          <span className="label">標題</span>
          <input
            className="input"
            name="title"
            required
            maxLength={MESSAGE_TITLE_MAX_CODE_POINTS}
            placeholder="例：本週例會改期通知"
            defaultValue={editingDraft?.title ?? ""}
          />
        </label>
        <label className="field">
          <span className="label">內容</span>
          <textarea
            className={styles.textarea}
            name="body"
            required
            rows={5}
            maxLength={MESSAGE_BODY_MAX_CODE_POINTS}
            placeholder="訊息會出現在社員的訊息中心，不需要加入 LINE 官方帳號也看得到。"
            defaultValue={editingDraft?.body ?? ""}
          />
        </label>
        <fieldset className="field">
          <legend className="label">發送對象</legend>
          <AudiencePicker
            key={editingDraft?.id ?? "new-audience"}
            clubId={clubId}
            tags={audienceTags}
            members={audienceMembers}
            initial={editingAudience}
          />
        </fieldset>
        <div className={styles.dateFields}>
          <label className="field">
            <span className="label">公告到期時間（選填）</span>
            <input className="input" type="datetime-local" name="expiresLocal" defaultValue={localDateTimeValue(editingDraft?.expires_at ?? null)} />
          </label>
          <label className="field">
            <span className="label">預定發布時間（排程時必填）</span>
            <input className="input" type="datetime-local" name="scheduledLocal" defaultValue={localDateTimeValue(editingDraft?.scheduled_at ?? null)} />
          </label>
        </div>
        <div className="form-actions">
          {!editingDraft && <button type="submit" className="button" disabled={sending || savingDraft}>
            {sending ? "傳送中…" : "立即發布並嘗試 LINE 推播"}
          </button>}
          <button type="button" className="button-secondary" disabled={sending || savingDraft} onClick={() => saveDraft("save")}>
            {savingDraft ? "儲存中…" : editingDraft ? "更新草稿" : "儲存草稿"}
          </button>
          <button type="button" className="button-secondary" disabled={sending || savingDraft} onClick={() => saveDraft("schedule")}>
            排程發布
          </button>
          <button type="button" className="button-secondary" disabled={sending || savingDraft} onClick={() => saveDraft("publish")}>
            儲存並立即發布
          </button>
          {editingDraft && <button type="button" className="link-button" onClick={() => setEditingDraft(null)}>
            離開草稿編輯
          </button>}
        </div>
      </form>
    </section>}

    <section>
      <div className="section-heading">
        <div><p className="eyebrow">收件匣</p><h2>我的訊息</h2></div>
        <span>{unreadCount > 0 ? `${unreadCount} 則未讀` : "沒有未讀訊息"}</span>
      </div>

      {pinnedMessages.length > 0 && <div className={styles.pinnedSection}>
        <h3>置頂公告</h3>
        <ul className={styles.list}>
          {pinnedMessages.map((message) => {
            const open = openMessageId === message.id;
            return <li key={message.id} className={message.read_at === null ? styles.unread : styles.item}>
              <button type="button" className={styles.itemHeading} aria-expanded={open} onClick={() => openMessage(message)}>
                <span className={styles.itemTitle}>
                  <span className={styles.pinLabel}>置頂</span>
                  {message.read_at === null && <span className={styles.dot} aria-label="未讀" />}
                  {message.title}
                </span>
                <span className={styles.meta}>{message.author_display_name} · {formatTime(message.published_at)}</span>
              </button>
              {open && <>
                <p className={styles.body}>{message.body}</p>
                {message.action_path && <Link className="link-button" href={message.action_path}>開啟相關功能</Link>}
              </>}
            </li>;
          })}
        </ul>
      </div>}

      {visibleMessages.length === 0
        ? <div className="empty-state"><h3>目前沒有訊息</h3><p>幹部發布訊息之後會出現在這裡。</p></div>
        : <ul className={styles.list}>
            {visibleMessages.map((message) => {
              const open = openMessageId === message.id;
              return <li key={message.id} className={message.read_at === null ? styles.unread : styles.item}>
                <button
                  type="button"
                  className={styles.itemHeading}
                  aria-expanded={open}
                  onClick={() => openMessage(message)}
                >
                  <span className={styles.itemTitle}>
                    {message.read_at === null && <span className={styles.dot} aria-label="未讀" />}
                    {message.title}
                  </span>
                  <span className={styles.meta}>
                    {message.author_display_name} · {formatTime(message.published_at)} · 發給 {audienceLabel(message)}
                    {message.action_status && <> · 生日任務：{actionStatusLabel(message.action_status)}</>}
                  </span>
                </button>
                {open && <>
                  <p className={styles.body}>{message.body}</p>
                  {message.action_path && <Link className="link-button" href={message.action_path}>
                    開啟相關功能
                  </Link>}
                </>}
              </li>;
            })}
          </ul>}

      {cursor && <div className="form-actions">
        <button type="button" className="button-secondary" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "載入中…" : "載入更多"}
        </button>
      </div>}
    </section>

    {canSend && <section>
      <div className="section-heading">
        <div><p className="eyebrow">社務管理</p><h2>公告排程與紀錄</h2></div>
      </div>
      {lifecycleUnavailable && <p className={styles.error} role="alert">無法載入公告管理清單；請重新整理，避免把讀取失敗誤認為沒有公告。</p>}
      {!lifecycleUnavailable && lifecycle.length === 0
        ? <div className="empty-state"><h3>目前沒有公告紀錄</h3><p>草稿、排程、已發布與封存的公告會列在這裡。</p></div>
        : <div className={styles.sentList}>
            {lifecycle.map((message) => <SentMessage
              key={message.id}
              clubId={clubId}
              message={message}
              onUpdate={upsertLifecycle}
              onRemove={(messageId) => {
                setLifecycle((current) => current.filter((entry) => entry.id !== messageId));
                setMessages((current) => current.filter((entry) => entry.id !== messageId));
                setPinnedMessages((current) => current.filter((entry) => entry.id !== messageId));
              }}
              onEditDraft={setEditingDraft}
            />)}
          </div>}
    </section>}
  </div>;
}

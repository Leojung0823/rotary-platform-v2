"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  markClubMessageReadAction,
  sendClubMessageAction,
  withdrawClubMessageAction,
} from "@/app/message-center-actions";
import { AudiencePicker, type AudienceMember, type AudienceTag } from "@/components/audience/audience-picker";
import type {
  ClubMessage,
  MessageDeliveries,
  SentClubMessage,
} from "@/lib/message-center/contracts";
import styles from "./message-center.module.css";

// Mirrored from the server-side validator rather than imported: that module
// pulls in the cursor codec, which is Node-only, and this component ships to
// the browser. The database enforces both limits regardless.
const MESSAGE_TITLE_MAX_CODE_POINTS = 120;
const MESSAGE_BODY_MAX_CODE_POINTS = 4000;

type Inbox = { messages: ClubMessage[]; unread_count: number; next_cursor: string | null };
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
  return new Intl.DateTimeFormat("zh-TW", {
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

function SentMessage({
  clubId,
  message,
  onWithdraw,
}: {
  clubId: string;
  message: SentClubMessage;
  onWithdraw: (messageId: string) => void;
}) {
  const [showDeliveries, setShowDeliveries] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [failed, setFailed] = useState(false);

  const withdraw = async () => {
    setWithdrawing(true);
    setFailed(false);
    const result = await withdrawClubMessageAction(clubId, message.id);
    if (result.ok) onWithdraw(message.id);
    else setFailed(true);
    setWithdrawing(false);
  };

  return <article className={styles.sentItem}>
    <div className={styles.sentHeading}>
      <strong>{message.title}</strong>
      <span className={styles.meta}>
        {formatTime(message.published_at)} · 發給 {audienceLabel(message, message.audience_tag_names)} ·
        {" "}已讀 {message.read_count}／{message.recipient_count}
      </span>
    </div>
    <p className={styles.body}>{message.body}</p>
    <div className={styles.sentActions}>
      <button type="button" className="link-button" onClick={() => setShowDeliveries((open) => !open)}>
        {showDeliveries ? "收合已讀名單" : "查看誰還沒讀"}
      </button>
      <button type="button" className="link-button" onClick={withdraw} disabled={withdrawing}>
        {withdrawing ? "收回中…" : "收回訊息"}
      </button>
    </div>
    {failed && <p className={styles.error} role="alert">收回沒有完成，請稍後再試。</p>}
    {showDeliveries && <Deliveries clubId={clubId} messageId={message.id} />}
  </article>;
}

export function MessageCenter({
  clubId,
  initialInbox,
  canSend = false,
  audienceTags = [],
  audienceMembers = [],
  initialSent = [],
}: {
  clubId: string;
  initialInbox: Inbox;
  /** True only for an officer who may address the club. */
  canSend?: boolean;
  audienceTags?: readonly AudienceTag[];
  audienceMembers?: readonly AudienceMember[];
  initialSent?: readonly SentClubMessage[];
}) {
  const [messages, setMessages] = useState<ClubMessage[]>(initialInbox.messages);
  const [cursor, setCursor] = useState<string | null>(initialInbox.next_cursor);
  const [unreadCount, setUnreadCount] = useState(initialInbox.unread_count);
  const [openMessageId, setOpenMessageId] = useState<string | null>(null);
  const [sent, setSent] = useState<SentClubMessage[]>([...initialSent]);
  const [sending, setSending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [stateMessage, setStateMessage] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

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

    setSent((current) => [{
      ...result.message,
      recipient_count: 0,
      read_count: 0,
      audience_tag_names: [],
    }, ...current]);
    // The counts come from the server on the next load; saying "sent" with a
    // recipient count we made up would be worse than saying nothing.
    setStateMessage("訊息已送出。重新整理可以看到送達與已讀人數。");
  };

  return <div className={styles.center}>
    {stateMessage && <p className={sessionExpired ? styles.error : styles.notice} role="status">{stateMessage}</p>}

    {canSend && <section className={styles.composer}>
      <div className="section-heading">
        <div><p className="eyebrow">發送</p><h2>發布訊息</h2></div>
      </div>
      {/* An ordinary form posting to a server action: the audience picker
          already emits hidden inputs, so choosing who receives the message
          needs no state in this component. */}
      <form className="form-stack" action={send}>
        <input type="hidden" name="clubId" value={clubId} />
        <label className="field">
          <span className="label">標題</span>
          <input
            className="input"
            name="title"
            required
            maxLength={MESSAGE_TITLE_MAX_CODE_POINTS}
            placeholder="例：本週例會改期通知"
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
          />
        </label>
        <fieldset className="field">
          <legend className="label">發送對象</legend>
          <AudiencePicker clubId={clubId} tags={audienceTags} members={audienceMembers} />
        </fieldset>
        <div className="form-actions">
          <button type="submit" className="button" disabled={sending}>
            {sending ? "傳送中…" : "送出訊息"}
          </button>
        </div>
      </form>
    </section>}

    <section>
      <div className="section-heading">
        <div><p className="eyebrow">收件匣</p><h2>我的訊息</h2></div>
        <span>{unreadCount > 0 ? `${unreadCount} 則未讀` : "沒有未讀訊息"}</span>
      </div>

      {messages.length === 0
        ? <div className="empty-state"><h3>目前沒有訊息</h3><p>幹部發布訊息之後會出現在這裡。</p></div>
        : <ul className={styles.list}>
            {messages.map((message) => {
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
        <div><p className="eyebrow">紀錄</p><h2>已送出的訊息</h2></div>
      </div>
      {sent.length === 0
        ? <div className="empty-state"><h3>還沒有送出過訊息</h3><p>送出的訊息與已讀人數會列在這裡。</p></div>
        : <div className={styles.sentList}>
            {sent.map((message) => <SentMessage
              key={message.id}
              clubId={clubId}
              message={message}
              onWithdraw={(messageId) => {
                setSent((current) => current.filter((entry) => entry.id !== messageId));
                setMessages((current) => current.filter((entry) => entry.id !== messageId));
              }}
            />)}
          </div>}
    </section>}
  </div>;
}

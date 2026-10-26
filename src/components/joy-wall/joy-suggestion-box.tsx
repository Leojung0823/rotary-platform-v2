"use client";

import { useState, type FormEvent } from "react";
import { JOY_SUGGESTION_MAX_CODE_POINTS } from "@/lib/joy-wall/validation";
import styles from "./joy-suggestions.module.css";

type Envelope = { data?: unknown; error?: string };

export function JoySuggestionBox({ clubId }: { clubId: string }) {
  const [content, setContent] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const count = Array.from(content).length;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = content.trim();
    if (!normalized || Array.from(normalized).length > JOY_SUGGESTION_MAX_CODE_POINTS || !acknowledged) return;
    setPending(true);
    setMessage(null);
    try {
      const query = new URLSearchParams({ club_id: clubId });
      const response = await fetch(`/api/v1/joy/suggestions?${query.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: normalized }),
      });
      const payload = await response.json().catch(() => null) as Envelope | null;
      if (!response.ok || !payload || !("data" in payload)) {
        throw new Error(payload?.error === "rate_limited" ? "近期送出的建議較多，請稍後再試。" : "建議沒有送出，請稍後再試。原本內容仍保留在欄位中。");
      }
      setContent("");
      setAcknowledged(false);
      setMessage("謝謝你，建議已匿名送出給本社幹部。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "建議沒有送出，請稍後再試。原本內容仍保留在欄位中。");
    } finally {
      setPending(false);
    }
  }

  return <section className={styles.panel} aria-labelledby="joy-suggestion-title">
    <div>
      <p className="eyebrow">讓社務更好</p>
      <h2 id="joy-suggestion-title">匿名建議箱</h2>
      <p className={styles.intro}>提供對社務、活動或平台的建議。社內幹部只會看到建議內容，不會看到提交者姓名。</p>
    </div>
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <label className={styles.field}>
        <span>你的建議</span>
        <textarea value={content} rows={4} maxLength={JOY_SUGGESTION_MAX_CODE_POINTS}
          onChange={(event) => setContent(event.target.value)} disabled={pending}
          placeholder="寫下你希望改善的地方或新的想法……" required />
      </label>
      <div className={styles.counter} aria-live="polite">{count} / {JOY_SUGGESTION_MAX_CODE_POINTS}</div>
      <label className={styles.consent}>
        <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} disabled={pending} />
        <span>我了解：幹部不會看到作者，但平台會保留提交者資料供受限安全稽核；請勿在內容中透露自己的身分。</span>
      </label>
      <div className={styles.footer}>
        <small>每位社員每小時最多送出 5 則；請勿填寫密碼或其他敏感資料。</small>
        <button type="submit" disabled={pending || !acknowledged || count === 0 || count > JOY_SUGGESTION_MAX_CODE_POINTS}>
          {pending ? "送出中…" : "匿名送出"}
        </button>
      </div>
      {message && <p className={styles.message} role="status">{message}</p>}
    </form>
  </section>;
}

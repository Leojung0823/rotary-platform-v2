"use client";

import { useState } from "react";
import type { JoySuggestion } from "@/lib/joy-wall/contracts";
import { APP_TIME_ZONE } from "@/lib/time";
import styles from "./joy-suggestions.module.css";

export function JoySuggestionQueue({ clubId, initialSuggestions }: { clubId: string; initialSuggestions: readonly JoySuggestion[] }) {
  const [suggestions, setSuggestions] = useState([...initialSuggestions]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(suggestion: JoySuggestion, action: "reviewed" | "dismissed") {
    setPendingId(suggestion.suggestion_id);
    setError(null);
    try {
      const query = new URLSearchParams({ club_id: clubId });
      const response = await fetch(`/api/v1/joy/suggestions/${encodeURIComponent(suggestion.suggestion_id)}?${query.toString()}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => null) as { data?: unknown } | null;
      if (!response.ok || !payload || !("data" in payload)) throw new Error("request_failed");
      setSuggestions((current) => current.filter((item) => item.suggestion_id !== suggestion.suggestion_id));
    } catch {
      setError("處理沒有完成，請重新整理後再試；建議仍保留在待處理清單。");
    } finally {
      setPendingId(null);
    }
  }

  if (suggestions.length === 0) return <div className={styles.empty}><strong>目前沒有待處理建議</strong><span>新的匿名建議會出現在這裡。</span></div>;
  return <section className={styles.list} aria-label="匿名建議待處理清單">
    {error && <p className={styles.error} role="alert">{error}</p>}
    {suggestions.map((suggestion) => <article className={styles.card} key={suggestion.suggestion_id}>
      <header><strong>匿名建議</strong><time dateTime={suggestion.created_at}>{new Intl.DateTimeFormat("zh-TW", {
        timeZone: APP_TIME_ZONE, year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
      }).format(new Date(suggestion.created_at))}</time></header>
      <p className={styles.content}>{suggestion.content}</p>
      <p className={styles.privacy}>此清單不顯示提交者身分。處理結果只作為內部狀態紀錄。</p>
      <div className={styles.actions}>
        <button type="button" className={styles.dismiss} disabled={pendingId === suggestion.suggestion_id}
          onClick={() => void review(suggestion, "dismissed")}>不需處理</button>
        <button type="button" disabled={pendingId === suggestion.suggestion_id}
          onClick={() => void review(suggestion, "reviewed")}>{pendingId === suggestion.suggestion_id ? "處理中…" : "已閱讀，完成處理"}</button>
      </div>
    </article>)}
  </section>;
}

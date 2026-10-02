"use client";

import { useState } from "react";
import type { JoyReport } from "@/lib/joy-wall/contracts";
import { parseJoyModerationBody } from "@/lib/joy-wall/validation";
import styles from "./joy-moderation-queue.module.css";

const reasonLabels: Record<JoyReport["reason"], string> = {
  spam: "垃圾內容", harassment: "騷擾或攻擊", privacy: "涉及隱私",
  inappropriate: "不適當內容", other: "其他原因",
};
const typeLabels: Record<JoyReport["post_type"], string> = {
  blessing: "祝福", gratitude: "感謝", welcome: "迎新", encouragement: "加油打氣",
  memory: "活動回憶", question: "提問交流", other: "其他分享",
  iou: "非現金承諾",
};

async function readSuccess(response: Response) {
  const payload = await response.json().catch(() => null) as { data?: unknown } | null;
  if (!response.ok || !payload || !("data" in payload)) throw new Error("request_failed");
}

export function JoyModerationQueue({ clubId, initialReports }: { clubId: string; initialReports: readonly JoyReport[] }) {
  const [reports, setReports] = useState([...initialReports]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(report: JoyReport, action: "hide" | "dismiss") {
    const note = (notes[report.report_id] ?? "").trim() || null;
    setPendingId(report.report_id); setError(null);
    try {
      const body = parseJoyModerationBody({ action, reviewerNote: note });
      const response = await fetch("/api/v1/joy/reports", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, reportId: report.report_id, ...body }),
      });
      await readSuccess(response);
      setReports((current) => current.filter((item) => item.report_id !== report.report_id));
    } catch {
      setError("處理沒有完成，請重新整理後再試；系統不會假裝檢舉已處理。");
    } finally { setPendingId(null); }
  }

  if (reports.length === 0) return <div className={styles.empty}><strong>待處理檢舉已清空</strong><span>每次處置都會保留稽核紀錄。</span></div>;
  return <section className={styles.list} aria-label="待處理檢舉">
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {reports.map((report) => <article className={styles.card} key={report.report_id}>
      <header><span className={styles.reason}>{reasonLabels[report.reason]}</span><span>{typeLabels[report.post_type]} · {report.author_display_name}</span></header>
      {report.post_title && <h2>{report.post_title}</h2>}
      <p className={styles.content}>{report.post_content}</p>
      <label><span>處理備註（選填）</span><textarea rows={2} maxLength={500} value={notes[report.report_id] ?? ""}
        onChange={(event) => setNotes((current) => ({ ...current, [report.report_id]: event.target.value }))} /></label>
      <div className={styles.actions}>
        <button type="button" className={styles.dismiss} disabled={pendingId === report.report_id} onClick={() => void resolve(report, "dismiss")}>不需處理</button>
        <button type="button" disabled={pendingId === report.report_id} onClick={() => void resolve(report, "hide")}>{pendingId === report.report_id ? "處理中…" : "隱藏分享"}</button>
      </div>
    </article>)}
  </section>;
}

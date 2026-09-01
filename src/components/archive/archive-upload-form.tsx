"use client";

import { useState } from "react";

const maximumBytes = 10 * 1024 * 1024;
const acceptedTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "text/plain",
]);

export function ArchiveUploadForm({
  clubId,
  yearId,
  itemId,
}: {
  clubId: string;
  yearId: string;
  itemId: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(formData: FormData) {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size < 1 || file.size > maximumBytes || !acceptedTypes.has(file.type)) {
      setMessage("請選擇 10 MB 以內的 PDF、Office、JPG、PNG 或純文字檔。");
      return;
    }
    setBusy(true);
    setMessage("正在安全上傳，請不要關閉畫面…");
    formData.set("clubId", clubId);
    formData.set("itemId", itemId);
    try {
      const response = await fetch("/api/v1/archive/uploads", {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      });
      if (!response.ok) {
        setMessage(response.status === 413 ? "檔案超過 10 MB。" : "上傳沒有完成，請稍後再試。");
        return;
      }
      const query = new URLSearchParams({ yearId, mode: "management", success: "version_uploaded" });
      window.location.assign(`/clubs/${encodeURIComponent(clubId)}/archives?${query.toString()}`);
    } catch {
      setMessage("網路中斷，檔案尚未完成上傳。");
    } finally {
      setBusy(false);
    }
  }

  return <form action={upload} className="form-stack">
    <label className="field">
      <span className="label">新增文件版本</span>
      <input
        className="input"
        name="file"
        type="file"
        required
        accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png,.txt"
        disabled={busy}
      />
      <span className="hint">最多 10 MB；舊版本不會被覆蓋。</span>
    </label>
    <label className="field">
      <span className="label">版本說明</span>
      <input className="input" name="changeSummary" maxLength={500} placeholder="例如：補上簽到名單" disabled={busy} />
    </label>
    {message && <p role="status">{message}</p>}
    <button className="button" type="submit" disabled={busy}>{busy ? "上傳中…" : "上傳新版本"}</button>
  </form>;
}

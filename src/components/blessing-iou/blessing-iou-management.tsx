"use client";

import { useState, type FormEvent } from "react";
import type { BlessingIouManagementContext } from "@/lib/blessing-iou/contracts";
import { BlessingWall } from "./blessing-wall";
import styles from "./blessing-iou-management.module.css";

type ApiEnvelope<T> = { data?: T; error?: string };

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || payload?.data === undefined) throw new Error("setting_update_failed");
  return payload.data;
}

export function BlessingIouManagement({
  initialContext,
}: {
  initialContext: BlessingIouManagementContext;
}) {
  const [allowPublicAmounts, setAllowPublicAmounts] = useState(initialContext.allowPublicAmounts);
  const [selectedValue, setSelectedValue] = useState(initialContext.allowPublicAmounts);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function saveSetting(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const query = new URLSearchParams({ club_id: initialContext.clubId });
      const response = await fetch(`/api/v1/blessing-iou/settings?${query.toString()}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowPublicAmounts: selectedValue }),
      });
      const updated = await readResponse<BlessingIouManagementContext>(response);
      setAllowPublicAmounts(updated.allowPublicAmounts);
      setSelectedValue(updated.allowPublicAmounts);
      setMessage(updated.allowPublicAmounts
        ? "已允許社員在新祝福中公開金額。舊祝福不會自動改成公開。"
        : "已關閉公開金額。社員仍可填寫金額，但只有本人與授權幹部看得到。"
      );
    } catch {
      setMessage("設定沒有儲存成功，請稍後再試。");
    } finally {
      setSaving(false);
    }
  }

  return <div className={styles.management}>
    <section className={styles.setting} aria-labelledby="amount-visibility-title">
      <div>
        <p className={styles.eyebrow}>社內設定</p>
        <h2 id="amount-visibility-title">祝福牆金額顯示</h2>
        <p>祝福文字一律供本社社員查看。這個開關只決定社員能不能選擇公開新祝福的金額。</p>
      </div>
      <form onSubmit={saveSetting}>
        <label className={styles.choice}>
          <input
            type="radio"
            name="amount-visibility"
            checked={!selectedValue}
            onChange={() => setSelectedValue(false)}
            disabled={saving}
          />
          <span><strong>金額一律不公開</strong><small>本人與授權幹部仍可查看。</small></span>
        </label>
        <label className={styles.choice}>
          <input
            type="radio"
            name="amount-visibility"
            checked={selectedValue}
            onChange={() => setSelectedValue(true)}
            disabled={saving}
          />
          <span><strong>允許社員公開金額</strong><small>社員每次仍可選擇隱藏；以前建立的祝福不會自動公開。</small></span>
        </label>
        <button type="submit" disabled={saving || selectedValue === allowPublicAmounts}>
          {saving ? "儲存中…" : "儲存設定"}
        </button>
      </form>
      {message && <p className={styles.message} role="status">{message}</p>}
    </section>

    <section>
      <div className={styles.wallHeading}>
        <p className={styles.eyebrow}>內容管理</p>
        <h2>祝福牆內容</h2>
        <p>幹部可以查看所有金額，也能刪除尚未進入收款流程的內容；刪除時必須留下原因。</p>
      </div>
      <BlessingWall
        key={`${initialContext.clubId}-${allowPublicAmounts}`}
        clubId={initialContext.clubId}
        allowPublicAmounts={allowPublicAmounts}
        canCreate={false}
      />
    </section>
  </div>;
}

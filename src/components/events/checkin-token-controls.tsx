"use client";

import { useActionState } from "react";
import {
  openCheckinAction,
  rotateCheckinTokenAction,
  type CheckinTokenActionState,
} from "@/app/checkin-actions";

const initialState: CheckinTokenActionState = { status: "idle" };

const errorMessages: Record<string, string> = {
  invalid_input: "簽到有效時間格式不正確。",
  forbidden: "目前帳號沒有管理簽到的權限。",
  not_eligible: "只有已發布且計入出席的活動可以開啟簽到。",
  window_closed: "目前不在活動前後 24 小時的簽到管理時間窗。",
  already_open: "目前已有有效簽到 token，請改用旋轉 token。",
  not_open: "目前沒有可旋轉的有效簽到 token。",
  unexpected: "目前無法產生簽到 token，請稍後再試。",
};

function TokenResult({ state }: { state: CheckinTokenActionState }) {
  if (state.status === "error") {
    return <div className="notice notice-error" role="alert">
      {errorMessages[state.code] ?? errorMessages.unexpected}
    </div>;
  }
  if (state.status !== "success") return null;

  const expiresAt = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(state.expiresAt));

  return <div className="notice notice-success" role="status">
    <strong>{state.operation === "opened" ? "簽到 token 已開啟" : "簽到 token 已旋轉"}</strong>
    <p>原始 token 只顯示這一次，到期時間：{expiresAt}。請在離開頁面前複製。</p>
    <label className="field">
      <span className="label">一次性顯示的 QR token</span>
      <textarea className="input token-value" value={state.token} readOnly rows={3} aria-label="一次性簽到 token" />
    </label>
    <span className="hint">識別前綴：{state.tokenPrefix}。資料庫只保存 SHA-256 hash，不保存此明文。</span>
  </div>;
}

export function CheckinTokenControls({
  clubId,
  eventId,
  hasActiveSession,
}: {
  clubId: string;
  eventId: string;
  hasActiveSession: boolean;
}) {
  const [openState, openAction, openPending] = useActionState(openCheckinAction, initialState);
  const [rotateState, rotateAction, rotatePending] = useActionState(rotateCheckinTokenAction, initialState);
  const effectiveActive = hasActiveSession || openState.status === "success" || rotateState.status === "success";

  return <div className="form-stack">
    {!effectiveActive && <form action={openAction} className="inline-form">
      <input type="hidden" name="clubId" value={clubId} />
      <input type="hidden" name="eventId" value={eventId} />
      <label className="field">
        <span className="label">有效分鐘</span>
        <input className="input" type="number" name="duration" min={5} max={240} defaultValue={30} required />
      </label>
      <span className="hint">開啟後只顯示一次原始 token。</span>
      <button className="button" type="submit" disabled={openPending}>
        {openPending ? "產生中…" : "開啟簽到"}
      </button>
    </form>}

    {effectiveActive && <form action={rotateAction} className="inline-form">
      <input type="hidden" name="clubId" value={clubId} />
      <input type="hidden" name="eventId" value={eventId} />
      <label className="field">
        <span className="label">新 token 有效分鐘</span>
        <input className="input" type="number" name="duration" min={5} max={240} defaultValue={30} required />
      </label>
      <span className="hint">旋轉後舊 token 立即失效。</span>
      <button className="button button-secondary" type="submit" disabled={rotatePending}>
        {rotatePending ? "旋轉中…" : "旋轉 token"}
      </button>
    </form>}

    {rotateState.status !== "success" && <TokenResult state={openState} />}
    <TokenResult state={rotateState} />
  </div>;
}

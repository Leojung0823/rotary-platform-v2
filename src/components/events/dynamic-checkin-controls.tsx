"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  openDynamicCheckinAction,
  refreshDynamicCheckinCredentialAction,
  type DynamicQrActionState,
} from "@/app/checkin-actions";
import { CheckinQrCode } from "@/components/events/checkin-qr-code";
import {
  DYNAMIC_QR_ROTATION_INTERVAL_MS,
  dynamicCredentialIsUsable,
  type CheckinSafeErrorCode,
} from "@/lib/checkin/dynamic";

const errorMessages: Record<CheckinSafeErrorCode, string> = {
  invalid_input: "簽到資訊不完整，請重新整理後再試。",
  forbidden: "目前帳號沒有管理此活動簽到的權限。",
  not_eligible: "只有已發布且計入出席的活動可以開啟簽到。",
  window_closed: "目前不在活動前後 24 小時的簽到管理時間窗。",
  already_open: "目前已有有效簽到場次，請取得最新 QR。",
  not_open: "目前沒有可使用的簽到場次。",
  legacy_session_active: "此活動仍在使用舊版簽到場次。請先回退至舊版完成輪替或關閉後，再開啟新版 QR。",
  invalid_token: "QR 資訊無效，請重新產生。",
  expired: "QR 已過期，請重新產生。",
  session_closed: "簽到場次已關閉，無法產生 QR。",
  not_found: "找不到可操作的簽到紀錄。",
  temporary: "目前無法更新 QR，現有未過期 QR 仍可使用；請稍後重試。",
};
const initialDynamicQrActionState: DynamicQrActionState = { status: "idle", revision: 0 };

function actionData(clubId: string, eventId: string, rotation?: "emergency") {
  const formData = new FormData();
  formData.set("clubId", clubId);
  formData.set("eventId", eventId);
  if (rotation) formData.set("rotation", rotation);
  return formData;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(value));
}

export function DynamicCheckinControls({
  clubId,
  eventId,
  hasActiveSession,
}: {
  clubId: string;
  eventId: string;
  hasActiveSession: boolean;
}) {
  const [openState, openAction, openPending] = useActionState(openDynamicCheckinAction, initialDynamicQrActionState);
  const [refreshState, refreshAction, refreshPending] = useActionState(refreshDynamicCheckinCredentialAction, initialDynamicQrActionState);
  const [now, setNow] = useState(() => Date.now());

  const credentialState = refreshState.status === "success" ? refreshState : openState.status === "success" ? openState : null;
  const credentialUsable = credentialState ? dynamicCredentialIsUsable(credentialState.expiresAt, now) : false;
  const hasSession = hasActiveSession || openState.status === "success";
  const busy = openPending || refreshPending;

  useEffect(() => {
    if (!credentialState || !credentialUsable || busy) return;
    const timer = window.setTimeout(() => {
      refreshAction(actionData(clubId, eventId));
    }, DYNAMIC_QR_ROTATION_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [busy, clubId, credentialState, credentialState?.revision, credentialUsable, eventId, refreshAction]);

  useEffect(() => {
    if (!credentialState) return;
    const timeout = window.setTimeout(() => setNow(Date.now()), Math.max(0, Date.parse(credentialState.expiresAt) - Date.now()) + 20);
    return () => window.clearTimeout(timeout);
  }, [credentialState]);

  const latestError = useMemo(() => refreshState.status === "error" ? refreshState : openState.status === "error" ? openState : null, [openState, refreshState]);

  return <div className="form-stack">
    {!hasSession && <div className="form-actions">
      <button className="button" type="button" onClick={() => openAction(actionData(clubId, eventId))} disabled={busy}>
        {openPending ? "開啟中…" : "開啟動態簽到 QR"}
      </button>
    </div>}

    {hasSession && !credentialState && <div className="form-actions">
      <button className="button" type="button" onClick={() => refreshAction(actionData(clubId, eventId))} disabled={busy}>
        {refreshPending ? "取得中…" : "顯示目前動態 QR"}
      </button>
    </div>}

    {latestError && <div className="notice notice-error" role="alert">
      {errorMessages[latestError.code]}
    </div>}

    {credentialState && <section className="dynamic-qr-panel" aria-labelledby="dynamic-qr-heading">
      <div>
        <p className="eyebrow">短效動態 QR</p>
        <h3 id="dynamic-qr-heading">{credentialUsable ? "可簽到" : "已過期"}</h3>
        <p className="hint">
          {refreshPending
            ? "更新中；目前 QR 在到期前仍可使用。"
            : credentialUsable
              ? `有效至 ${formatTime(credentialState.expiresAt)}，QR 會自動更新。`
              : "此 QR 已過期，請立即重新取得。"}
        </p>
        <p className="sr-only" aria-live="off">
          {refreshPending ? "更新中" : credentialUsable ? "可簽到" : "已過期"}
        </p>
        <div className="form-actions">
          <button className="button button-secondary" type="button" onClick={() => refreshAction(actionData(clubId, eventId))} disabled={busy}>
            {refreshPending ? "更新中…" : "更新 QR"}
          </button>
          <button className="button button-danger" type="button" onClick={() => refreshAction(actionData(clubId, eventId, "emergency"))} disabled={busy}>
            立即更換 QR
          </button>
        </div>
      </div>
      {credentialUsable ? <CheckinQrCode token={credentialState.credential} /> : <div className="dynamic-qr-expired" role="status">已過期</div>}
    </section>}

    <p className="hint">QR 只保存在目前瀏覽器記憶體，不會顯示、複製或保存原始 credential。自動更新最多保留 30 秒重疊；「立即更換 QR」會立即使舊 QR 失效。</p>
  </div>;
}

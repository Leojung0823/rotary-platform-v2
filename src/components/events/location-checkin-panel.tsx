"use client";

import { useActionState, useState, useTransition } from "react";
import {
  selfLocationCheckinAction,
  type LocationSelfCheckinActionState,
} from "@/app/checkin-actions";
import styles from "./checkin-scanner.module.css";

export type LocationCheckinEvent = {
  club_id: string;
  club_name: string;
  event_id: string;
  title: string;
  starts_at: string;
  already_checked_in: boolean;
};

type LocatingStatus = "idle" | "locating" | "unsupported" | "denied" | "unavailable";

const initialState: LocationSelfCheckinActionState = { status: "idle" };

const errorMessages: Record<string, string> = {
  out_of_range: "您目前的位置不在活動場地範圍內。請到現場後再試，或改用掃描 QR。",
  venue_missing: "這個活動沒有設定場地座標，無法用定位簽到。請改用掃描 QR。",
  session_closed: "簽到場次已關閉，請向現場管理者確認。",
  forbidden: "目前帳號不是該社有效社員，無法簽到。",
  not_eligible: "這個活動目前不能簽到。",
  invalid_input: "無法讀取有效的定位資訊，請重試或改用掃描 QR。",
};

export function LocationCheckinPanel({ events }: { events: readonly LocationCheckinEvent[] }) {
  const [state, action, actionPending] = useActionState(selfLocationCheckinAction, initialState);
  const [transitionPending, startTransition] = useTransition();
  const [locating, setLocating] = useState<LocatingStatus>("idle");

  const busy = locating === "locating" || actionPending || transitionPending;

  const checkIn = (event: LocationCheckinEvent) => {
    if (!window.isSecureContext || !navigator.geolocation) {
      setLocating("unsupported");
      return;
    }
    setLocating("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating("idle");
        const formData = new FormData();
        formData.set("clubId", event.club_id);
        formData.set("eventId", event.event_id);
        // Sent once, to the server action only. Nothing here is stored on the
        // device or added to the URL.
        formData.set("latitude", position.coords.latitude.toFixed(6));
        formData.set("longitude", position.coords.longitude.toFixed(6));
        startTransition(() => action(formData));
      },
      (error) => {
        setLocating(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  const resultMessage = state.status === "success"
    ? state.result === "already_checked_in"
      ? "您已完成此活動簽到，系統沒有建立重複紀錄。"
      : "簽到成功，系統已記錄您的社員社籍與簽到時間。"
    : state.status === "error"
      ? errorMessages[state.code] ?? "目前無法完成簽到，請稍後再試。"
      : null;

  return <section className="card form-stack">
    <div className="section-heading">
      <div><p className="eyebrow">人在現場</p><h2>用定位簽到</h2></div>
      <span>不保存位置</span>
    </div>

    {events.length === 0
      ? <p className="hint">目前沒有開放定位簽到的活動。活動需要由管理者開啟簽到，且建立活動時要設定場地座標。</p>
      : <ul className={styles.locationEventList}>
          {events.map((event) => <li key={event.event_id}>
            <div>
              <strong>{event.title}</strong>
              <small>{event.club_name}</small>
            </div>
            {event.already_checked_in
              ? <span className="badge badge-success">已簽到</span>
              : <button className="button" type="button" onClick={() => checkIn(event)} disabled={busy}>
                  {locating === "locating" ? "定位中…" : busy ? "處理中…" : "用定位簽到"}
                </button>}
          </li>)}
        </ul>}

    {locating === "unsupported" && <div className="notice notice-info" role="status">
      此瀏覽器或目前網址不支援定位。定位通常需要 HTTPS，請改用掃描 QR。
    </div>}
    {locating === "denied" && <div className="notice notice-error" role="alert">
      定位權限未允許。您可以調整瀏覽器權限後重試，或改用掃描 QR。
    </div>}
    {locating === "unavailable" && <div className="notice notice-error" role="alert">
      目前無法取得定位。室內收訊較差時可能發生，請走到窗邊重試，或改用掃描 QR。
    </div>}
    {resultMessage && <div
      className={`notice ${state.status === "success" ? "notice-success" : "notice-error"}`}
      role={state.status === "success" ? "status" : "alert"}
    >{resultMessage}</div>}

    <p className="hint">系統只會在您按下按鈕的那一刻讀取一次位置，用來確認您在場地範圍內；位置不會上傳保存、不會寫入紀錄，也不會被其他社員看到。</p>
  </section>;
}

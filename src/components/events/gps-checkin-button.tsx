"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { gpsCheckinAction, recordClientCheckinFailureAction } from "@/app/checkin-actions";

type LocationState = "idle" | "locating" | "denied" | "timeout" | "unavailable";

const serverMessages: Record<string, string> = {
  accuracy_insufficient: "目前無法取得準確位置。請移動到窗邊或室外，開啟手機的精確定位後再試一次。",
  outside_radius: "您目前不在活動簽到範圍內。請到活動現場後重新定位，或洽現場工作人員協助。",
  window_closed: "目前不在活動簽到時間內，請確認活動時間或洽現場工作人員。",
  not_eligible: "您目前不具備這場活動的簽到資格，請洽扶輪社秘書協助。",
  location_invalid: "手機回傳的位置無法使用，請重新開啟定位後再試一次。",
  unexpected: "定位簽到暫時無法完成，請稍後再試；若問題持續，請洽現場工作人員。",
};

export function GpsCheckinButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [state, setState] = useState<LocationState>("idle");
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const locate = () => {
    setServerError(null);
    if (!navigator.geolocation) {
      setState("unavailable");
      void recordClientCheckinFailureAction(eventId, "gps", "location_unavailable");
      return;
    }
    setState("locating");
    navigator.geolocation.getCurrentPosition((position) => {
      startTransition(async () => {
        const result = await gpsCheckinAction({
          eventId,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        });
        if (result.status === "success") {
          router.push(`/events/checkin/success?attendanceId=${encodeURIComponent(result.attendanceId)}`);
          return;
        }
        setState("idle");
        setServerError(result.code);
      });
    }, (error) => {
      const nextState = error.code === error.PERMISSION_DENIED ? "denied" : error.code === error.TIMEOUT ? "timeout" : "unavailable";
      setState(nextState);
      void recordClientCheckinFailureAction(eventId, "gps", nextState === "denied" ? "location_permission_denied" : nextState === "timeout" ? "location_timeout" : "location_unavailable");
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };

  return <section className="card form-stack">
    <div><h2>定位簽到</h2><p>到達活動現場後，取得一次目前位置以確認您在簽到範圍內。</p></div>
    {state === "denied" && <div className="notice notice-error" role="alert">請允許瀏覽器使用定位功能，才能完成定位簽到。請到網站設定開啟定位後再試一次。</div>}
    {state === "timeout" && <div className="notice notice-error" role="alert">定位等候時間過久。請移動到窗邊或室外、確認已開啟精確定位，再試一次。</div>}
    {state === "unavailable" && <div className="notice notice-error" role="alert">目前無法取得位置。請確認手機定位已開啟，或改用現場 QR Code；仍無法完成時請洽工作人員。</div>}
    {serverError && <div className="notice notice-error" role="alert">{serverMessages[serverError] ?? serverMessages.unexpected}</div>}
    <button className="button button-full" type="button" onClick={locate} disabled={state === "locating" || isPending}>{state === "locating" || isPending ? "正在確認您的位置……" : "定位簽到"}</button>
    <p className="hint">系統只在您按下按鈕時取得一次定位，不會持續追蹤。定位可協助判斷是否到場，但無法完全防止位置偽造。</p>
  </section>;
}

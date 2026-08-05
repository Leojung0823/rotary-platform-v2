"use client";

import { useEffect, useRef, useState } from "react";
import { issueDynamicQrAction } from "@/app/checkin-actions";
import { CheckinQrCode } from "@/components/events/checkin-qr-code";

export function DynamicCheckinQr({ clubId, eventId }: { clubId: string; eventId: string }) {
  const expiresRef = useRef<string | null>(null);
  const [payload, setPayload] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let timer: number | null = null;
    async function refresh() {
      const result = await issueDynamicQrAction(clubId, eventId);
      if (!active) return;
      if (result.status === "error") {
        setError(true);
        return;
      }
      setPayload(`${window.location.origin}/checkin#${new URLSearchParams({ credential: result.credential }).toString()}`);
      setExpiresAt(result.expiresAt);
      expiresRef.current = result.expiresAt;
      setError(false);
      const delay = Math.max(5_000, new Date(result.expiresAt).getTime() - Date.now() - 2_000);
      timer = window.setTimeout(refresh, delay);
    }
    void refresh();
    return () => { active = false; if (timer !== null) window.clearTimeout(timer); };
  }, [clubId, eventId]);

  useEffect(() => {
    if (!expiresAt) return;
    const interval = window.setInterval(() => {
      const expires = expiresRef.current;
      if (expires) setSecondsLeft(Math.max(0, Math.ceil((new Date(expires).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [expiresAt]);

  return <div className="dynamic-qr" aria-live="polite">
    {error ? <div className="notice notice-error" role="alert">目前無法更新現場 QR Code。請確認簽到仍在開放時間內，或重新整理頁面。</div>
      : payload ? <><CheckinQrCode value={payload} /><p><strong>QR Code 會自動更新</strong></p><p className="hint">約 {secondsLeft} 秒後更新。請社員掃描目前畫面上的 QR Code。</p></>
        : <div className="qr-loading" role="status">正在產生現場 QR Code……</div>}
  </div>;
}

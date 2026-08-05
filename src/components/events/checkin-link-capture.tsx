"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeScannedCheckinToken } from "@/lib/checkin/scan";

export function CheckinLinkCapture() {
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    const token = normalizeScannedCheckinToken(window.location.href);
    if (!token) {
      queueMicrotask(() => setError(true));
      return;
    }
    window.sessionStorage.setItem("rotary_checkin_credential", token);
    window.history.replaceState(null, "", "/checkin");
    fetch("/api/auth/line/session", { cache: "no-store", credentials: "same-origin" })
      .then((response) => response.ok ? response.json() as Promise<{ authenticated?: boolean }> : null)
      .then((session) => {
        const target = "/events/checkin?scan=1";
        router.replace(session?.authenticated ? target : `/login?returnTo=${encodeURIComponent(target)}`);
      })
      .catch(() => router.replace(`/login?returnTo=${encodeURIComponent("/events/checkin?scan=1")}`));
  }, [router]);

  return <main id="main" className="center-page">
    <section className="card accept-card" role={error ? "alert" : "status"} aria-live="polite">
      <span className="brand-mark large" aria-hidden="true">R</span>
      <h1>{error ? "QR Code 無法辨識" : "正在開啟簽到"}</h1>
      <p>{error ? "請掃描現場最新顯示的活動簽到 QR Code，或洽現場工作人員協助。" : "即將確認您的登入狀態與活動資訊……"}</p>
    </section>
  </main>;
}

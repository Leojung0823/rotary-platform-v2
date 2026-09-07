"use client";

import { useEffect } from "react";

export default function AuthenticatedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep the error boundary useful without sending account identifiers or
    // provider error text to a client-side telemetry service.
    console.error("authenticated_route_render_failed", error.digest ?? "unknown");
  }, [error.digest]);

  return <main className="center-page">
    <section className="card context-unavailable-card" role="alert">
      <p className="eyebrow">頁面暫時無法載入</p>
      <h1>請再試一次</h1>
      <p>資料沒有被刪除。請重新載入這一頁；如果仍然失敗，請聯絡社務管理員。</p>
      <div className="form-actions">
        <button className="button" type="button" onClick={() => reset()}>重新載入</button>
        <a className="button button-secondary" href="/dashboard">回到首頁</a>
      </div>
    </section>
  </main>;
}

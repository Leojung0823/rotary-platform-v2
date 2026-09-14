"use client";

import { useEffect } from "react";

/** Register the offline shell without making any authenticated response cacheable. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Offline support is an enhancement. A registration failure must never
      // block the authenticated application from rendering.
    });
  }, []);

  return null;
}

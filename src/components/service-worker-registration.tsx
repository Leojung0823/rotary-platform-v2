"use client";

import { useEffect } from "react";
import { useRef, useState } from "react";
import styles from "./service-worker-registration.module.css";

/** Register the offline shell without making any authenticated response cacheable. */
export function ServiceWorkerRegistration({ buildId }: { buildId: string }) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const registrationRef = useRef<globalThis.ServiceWorkerRegistration | null>(null);
  const updateRequestedRef = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;

    let disposed = false;
    let observedRegistration: globalThis.ServiceWorkerRegistration | null = null;
    let observedUpdateFound: (() => void) | null = null;

    const checkCurrentBuild = async () => {
      if (!buildId) return;
      try {
        const response = await fetch("/api/app-version", { cache: "no-store" });
        if (!response.ok) return;
        const current = await response.json() as { buildId?: unknown };
        if (!disposed && typeof current.buildId === "string" && current.buildId !== buildId) {
          setUpdateAvailable(true);
        }
      } catch {
        // Version discovery is optional and must not affect offline/login use.
      }
    };

    const checkOnResume = () => {
      if (document.visibilityState === "visible") {
        void checkCurrentBuild();
        void observedRegistration?.update().catch(() => undefined);
      }
    };

    void checkCurrentBuild();
    document.addEventListener("visibilitychange", checkOnResume);
    window.addEventListener("pageshow", checkOnResume);

    if (!("serviceWorker" in navigator)) {
      return () => {
        disposed = true;
        document.removeEventListener("visibilitychange", checkOnResume);
        window.removeEventListener("pageshow", checkOnResume);
      };
    }

    const onControllerChange = () => {
      if (updateRequestedRef.current) window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(async (registration) => {
      if (disposed) return;
      observedRegistration = registration;
      registrationRef.current = registration;

      const showWaitingUpdate = () => {
        if (registration.waiting && navigator.serviceWorker.controller) setUpdateAvailable(true);
      };
      const observedWorkers = new WeakSet<globalThis.ServiceWorker>();
      const observeInstallingWorker = (installing: globalThis.ServiceWorker | null) => {
        if (!installing || observedWorkers.has(installing)) return;
        observedWorkers.add(installing);
        installing.addEventListener("statechange", () => {
          if (!disposed && installing.state === "installed" && navigator.serviceWorker.controller) {
            setUpdateAvailable(true);
          }
        });
      };
      observedUpdateFound = () => {
        observeInstallingWorker(registration.installing);
      };

      registration.addEventListener("updatefound", observedUpdateFound);
      observeInstallingWorker(registration.installing);
      showWaitingUpdate();
      // register() performs an update check on navigation; this explicit check
      // also covers a long-lived standalone window returning after a release.
      await registration.update().catch(() => undefined);
    }).catch(() => {
      // Offline support is an enhancement. A registration failure must never
      // block the authenticated application from rendering.
    });

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", checkOnResume);
      window.removeEventListener("pageshow", checkOnResume);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      if (observedUpdateFound) observedRegistration?.removeEventListener("updatefound", observedUpdateFound);
    };
  }, [buildId]);

  if (!updateAvailable) return null;

  function applyUpdate() {
    const waiting = registrationRef.current?.waiting;
    if (!waiting) {
      window.location.reload();
      return;
    }
    updateRequestedRef.current = true;
    waiting.postMessage({ type: "SKIP_WAITING" });
  }

  return <aside className={styles.updateNotice} role="status" aria-live="polite">
    <span>「我是扶輪人」有新版本</span>
    <button type="button" onClick={applyUpdate}>點此更新</button>
  </aside>;
}

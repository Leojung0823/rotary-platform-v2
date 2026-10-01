"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  detectEmbeddedBrowser,
  detectInstallPlatform,
  externalInstallUrl,
  INSTALL_DISMISSAL_KEY,
  INSTALL_PAGE_HREF,
  installCardDismissalExpiresAt,
  isInstallCardDismissed,
  type InstallPlatform,
} from "@/lib/pwa/install";
import styles from "./install-experience.module.css";

type InstallChoice = { outcome: "accepted" | "dismissed"; platform: string };
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

function getStandaloneSnapshot() {
  if (typeof window === "undefined") return false;
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return Boolean(iosNavigator.standalone)
    || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

function subscribeStandalone(onChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("appinstalled", onChange);
  const displayMode = window.matchMedia?.("(display-mode: standalone)");
  displayMode?.addEventListener?.("change", onChange);
  return () => {
    window.removeEventListener("appinstalled", onChange);
    displayMode?.removeEventListener?.("change", onChange);
  };
}

function subscribeClientReady() {
  return () => undefined;
}

function useInstallEnvironment() {
  const ready = useSyncExternalStore(subscribeClientReady, () => true, () => false);
  const installed = useSyncExternalStore(subscribeStandalone, getStandaloneSnapshot, () => false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const platform = ready
    ? detectInstallPlatform(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)
    : "other";
  const embeddedBrowser = ready ? detectEmbeddedBrowser(navigator.userAgent) : null;

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function promptInstall() {
    if (!installPrompt) return false;
    const pendingPrompt = installPrompt;
    await pendingPrompt.prompt();
    const choice = await pendingPrompt.userChoice;
    setInstallPrompt(null);
    return choice.outcome === "accepted";
  }

  return { ready, platform, embeddedBrowser, installed, installPrompt, promptInstall };
}

function dismissedForAWeek() {
  try {
    return isInstallCardDismissed(window.localStorage.getItem(INSTALL_DISMISSAL_KEY));
  } catch {
    return false;
  }
}

export function PwaInstallCard() {
  const { ready, installed, installPrompt, promptInstall } = useInstallEnvironment();
  const [dismissedThisVisit, setDismissedThisVisit] = useState(false);

  if (!ready || installed || dismissedThisVisit || dismissedForAWeek()) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(INSTALL_DISMISSAL_KEY, String(installCardDismissalExpiresAt()));
    } catch {
      // A private-browsing storage restriction should only affect persistence,
      // not the user's ability to dismiss the card for this visit.
    }
    setDismissedThisVisit(true);
  }

  return <section className={styles.installCard} aria-labelledby="install-card-title">
    <div className={styles.installCardCopy}>
      <p className={styles.eyebrow}>手機桌面捷徑</p>
      <h2 id="install-card-title">📲 安裝「我是扶輪人」</h2>
      <p>加入手機桌面，下次一點就開。</p>
    </div>
    <div className={styles.installCardActions}>
      {installPrompt
        ? <button className="button" type="button" onClick={() => void promptInstall()}>安裝到手機</button>
        : <Link className="button" href={INSTALL_PAGE_HREF}>安裝到手機</Link>}
      <button className={styles.dismissButton} type="button" onClick={dismiss}>稍後再說</button>
    </div>
  </section>;
}

function EmbeddedBrowserNotice({ browser }: { browser: NonNullable<ReturnType<typeof detectEmbeddedBrowser>> }) {
  if (browser === "line") {
    return <aside className={styles.browserNotice} aria-label="用瀏覽器開啟">
      <strong>請先用瀏覽器開啟</strong>
      <p>請點右上角「⋯」，選擇「用瀏覽器開啟」，再依下方步驟安裝到手機。</p>
      <div className={styles.openBrowserExample} aria-hidden="true">
        <span>⋯</span><span>用瀏覽器開啟</span><b>›</b>
      </div>
    </aside>;
  }
  return <aside className={styles.browserNotice} aria-label="用瀏覽器開啟">
    <strong>請先用瀏覽器開啟</strong>
    <p>請點右上角「⋯」，選擇「用瀏覽器開啟」或「在 Safari／Chrome 開啟」，再依下方步驟安裝到手機。</p>
    <div className={styles.openBrowserExample} aria-hidden="true">
      <span>⋯</span><span>在 Safari／Chrome 開啟</span><b>›</b>
    </div>
  </aside>;
}

function InstallSteps({ platform }: { platform: InstallPlatform }) {
  if (platform === "ios") {
    return <section className={styles.steps} aria-labelledby="ios-install-heading">
      <h2 id="ios-install-heading">iPhone：加入主畫面</h2>
      <ol className={styles.visualSteps}>
        <li><span className={styles.stepNumber} aria-hidden="true">1</span><span><strong>點「分享」</strong><small>Safari 畫面下方的方框上箭頭</small></span><span className={styles.shareSymbol} aria-hidden="true">□↑</span></li>
        <li><span className={styles.stepNumber} aria-hidden="true">2</span><span><strong>選「加入主畫面」</strong><small>在分享選單中往下找</small></span><span className={styles.homeSymbol} aria-hidden="true">＋</span></li>
        <li><span className={styles.stepNumber} aria-hidden="true">3</span><span><strong>點右上角「加入」</strong><small>確認名稱是「我是扶輪人」</small></span><span className={styles.addSymbol} aria-hidden="true">加入</span></li>
      </ol>
      <p className={styles.versionNote}>不同 iPhone 版本的按鈕位置可能略有不同。</p>
      <p className={styles.loginHint}>第一次從桌面開啟時，如果尚未登入，請用 LINE 登入一次。</p>
    </section>;
  }

  if (platform === "android") {
    return <section className={styles.steps} aria-labelledby="android-install-heading">
      <h2 id="android-install-heading">Android：安裝到手機</h2>
      <p>若瀏覽器顯示安裝確認，點「安裝」。如果沒有出現，請點右上角「⋮」，再選「加到主畫面」或「安裝應用程式」。</p>
      <div className={styles.androidMenuExample} aria-hidden="true">
        <span aria-hidden="true">⋮</span>
        <div><strong>加到主畫面</strong><strong>安裝應用程式</strong></div>
      </div>
      <p className={styles.loginHint}>第一次從桌面開啟時，如果尚未登入，請用 LINE 登入一次。</p>
    </section>;
  }

  return <section className={styles.steps} aria-labelledby="mobile-install-heading">
    <h2 id="mobile-install-heading">在手機上安裝</h2>
    <p>請在 iPhone 使用 Safari，或在 Android 手機使用 Chrome 開啟本頁，再依照畫面上的安裝說明操作。</p>
    <p>加入主畫面後，第一次開啟時如果尚未登入，請用 LINE 登入一次。</p>
  </section>;
}

export function PwaInstallInstructions() {
  const { ready, platform, embeddedBrowser, installed, installPrompt, promptInstall } = useInstallEnvironment();
  const [copyMessage, setCopyMessage] = useState("");

  async function copyInstallLink() {
    try {
      await navigator.clipboard.writeText(externalInstallUrl(window.location.origin));
      setCopyMessage("安裝連結已複製，可以貼到 LINE 分享給社友。");
    } catch {
      setCopyMessage("無法自動複製，請複製瀏覽器網址列的連結分享。");
    }
  }

  return <div className={styles.installInstructions}>
    {ready && installed ? <section className={styles.installedNotice} role="status">
      <h2>已從桌面開啟「我是扶輪人」</h2>
      <p>如果尚未登入，請使用 LINE 登入後繼續使用。</p>
    </section> : <>
      {ready && embeddedBrowser && <EmbeddedBrowserNotice browser={embeddedBrowser} />}
      {ready && installPrompt && <button
        className={`button ${styles.promptButton}`}
        type="button"
        onClick={() => void promptInstall()}
      >安裝到手機</button>}
      {ready && <InstallSteps platform={platform} />}
    </>}
    <div className={styles.shareRow}>
      <button className={styles.copyButton} type="button" onClick={() => void copyInstallLink()}>複製安裝連結</button>
      {copyMessage && <p role="status">{copyMessage}</p>}
    </div>
  </div>;
}

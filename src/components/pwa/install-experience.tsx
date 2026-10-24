"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  detectEmbeddedBrowser,
  detectInstallPlatform,
  detectIosBrowser,
  externalInstallUrl,
  INSTALL_DISMISSAL_KEY,
  INSTALL_PAGE_HREF,
  installCardDismissalExpiresAt,
  iosSafariUsesPageMenu,
  isInstallCardDismissed,
  type InstallPlatform,
  type IosBrowser,
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
  const iosBrowser: IosBrowser = ready ? detectIosBrowser(navigator.userAgent) : "safari";
  const safariPageMenu = ready && iosSafariUsesPageMenu(navigator.userAgent);

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

  return { ready, platform, embeddedBrowser, iosBrowser, safariPageMenu, installed, installPrompt, promptInstall };
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

type GuideStep = {
  title: string;
  hint?: string;
  warning?: string;
  image?: { src: string; width: number; height: number; alt: string };
};

const confirmStep: GuideStep = {
  title: "直接點右上角藍色的「加入」",
  hint: "這時會跳出鍵盤，不用打字，也不用改名字。「打開為網頁 App」保持綠色就好。",
  image: { src: "/install-guide/common-confirm.webp", width: 720, height: 514, alt: "加入主畫面畫面，右上角的「加入」按鈕被紅圈標出" },
};

const moreStep = (src: string, height: number): GuideStep => ({
  title: "點右下角圓形的「檢視較多」",
  warning: "一開始看不到「加入主畫面」是正常的，要先按「檢視較多」。如果已經看到「加入主畫面」，直接點它。",
  image: { src, width: 720, height, alt: "分享選單，右下角向下箭頭的「檢視較多」被紅圈標出" },
});

function iosGuide(browser: IosBrowser, safariPageMenu: boolean): GuideStep[] {
  if (browser === "chrome") {
    return [
      {
        title: "點畫面最上面，網址右邊的「分享」",
        hint: "樣子是一個方框，上面有往上的箭頭。",
        image: { src: "/install-guide/chrome-1-share.webp", width: 720, height: 102, alt: "Chrome 上方網址列，右邊的分享按鈕被紅圈標出" },
      },
      moreStep("/install-guide/chrome-2-more.webp", 196),
      {
        title: "往下滑，點「加入主畫面」",
        hint: "在「列印」下面那一組，圖示是方框裡有一個＋號。",
        image: { src: "/install-guide/chrome-3-add.webp", width: 720, height: 634, alt: "展開的分享選單，「加入主畫面」被紅框標出" },
      },
      confirmStep,
    ];
  }

  if (safariPageMenu) {
    return [
      {
        title: "點畫面最下面，網址左邊的「≡」",
        hint: "三條橫線的按鈕。如果您看到的是方框上箭頭的「分享」，直接點它，跳到第 3 步。",
        image: { src: "/install-guide/safari-1-menu.webp", width: 720, height: 138, alt: "Safari 下方網址列，左邊的三條線按鈕被紅圈標出" },
      },
      {
        title: "在跳出的選單中點「分享」",
        image: { src: "/install-guide/safari-2-share.webp", width: 720, height: 621, alt: "Safari 選單，「分享」被紅框標出" },
      },
      moreStep("/install-guide/safari-3-more.webp", 205),
      {
        title: "往下滑，點「加入主畫面」",
        hint: "圖示是方框裡有一個＋號。",
        image: { src: "/install-guide/safari-4-add.webp", width: 720, height: 452, alt: "展開的分享選單，「加入主畫面」被紅框標出" },
      },
      confirmStep,
    ];
  }

  return [
    { title: "點「分享」", hint: "Safari 畫面下方中間，一個方框上面有往上箭頭的按鈕。" },
    { title: "往下滑，點「加入主畫面」", hint: "圖示是方框裡有一個＋號。如果沒看到，先點「檢視較多」或把選單往上推。" },
    { title: "直接點右上角的「加入」", hint: "名字已經幫您填好「我是扶輪人」，不用改。" },
  ];
}

function InstallSteps({ platform, iosBrowser, safariPageMenu }: {
  platform: InstallPlatform;
  iosBrowser: IosBrowser;
  safariPageMenu: boolean;
}) {
  if (platform === "ios" && iosBrowser === "other") {
    return <section className={styles.steps} aria-labelledby="ios-install-heading">
      <h2 id="ios-install-heading">iPhone：加入主畫面</h2>
      <p className={styles.browserSwitch}>請改用 iPhone 內建的 <strong>Safari</strong>（藍色指南針圖示）打開這個網頁，再照畫面上的步驟做。</p>
      <p>可以先按下方「複製安裝連結」，再到 Safari 上方網址列貼上。</p>
    </section>;
  }

  if (platform === "ios") {
    const guide = iosGuide(iosBrowser, safariPageMenu);
    return <section className={styles.steps} aria-labelledby="ios-install-heading">
      <h2 id="ios-install-heading">iPhone：加入主畫面</h2>
      <p className={styles.browserBadge}>您正在使用 {iosBrowser === "chrome" ? "Chrome" : "Safari"}，請照下面 {guide.length} 步做</p>
      <ol className={styles.guideSteps}>
        {guide.map((step, index) => <li key={step.title}>
          <div className={styles.guideStepHeader}>
            <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
            <strong>{step.title}</strong>
          </div>
          {step.hint && <p className={styles.guideHint}>{step.hint}</p>}
          {step.warning && <p className={styles.guideWarning}>{step.warning}</p>}
          {step.image && <Image
            className={styles.guideImage}
            src={step.image.src}
            alt={step.image.alt}
            width={step.image.width}
            height={step.image.height}
            sizes="(max-width: 720px) 100vw, 640px"
          />}
        </li>)}
      </ol>
      <p className={styles.versionNote}>不同 iPhone 版本的畫面可能略有不同。</p>
      <p className={styles.loginHint}>完成後，回到手機桌面點藍色 R 的「我是扶輪人」圖示。第一次從桌面開啟時，需要再用 LINE 登入一次，這是正常的，之後就不用了。</p>
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
  const { ready, platform, embeddedBrowser, iosBrowser, safariPageMenu, installed, installPrompt, promptInstall } = useInstallEnvironment();
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
      {ready && <InstallSteps platform={platform} iosBrowser={iosBrowser} safariPageMenu={safariPageMenu} />}
    </>}
    <div className={styles.shareRow}>
      <a
        className={styles.helpLink}
        href={ready ? `https://line.me/R/share?text=${encodeURIComponent(`可以幫我把「我是扶輪人」加到手機桌面嗎？ ${externalInstallUrl(window.location.origin)}`)}` : "https://line.me/R/share"}
      >做不到？用 LINE 請家人幫忙</a>
      <button className={styles.copyButton} type="button" onClick={() => void copyInstallLink()}>複製安裝連結</button>
      {copyMessage && <p role="status">{copyMessage}</p>}
    </div>
  </div>;
}

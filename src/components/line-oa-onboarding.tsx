"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { dismissLineOaOnboardingAction } from "@/app/line-oa-onboarding-actions";
import {
  lineOaHomePrompt,
  type LineOaOnboardingStatus,
} from "@/lib/line/oa-onboarding";
import styles from "./line-oa-onboarding.module.css";

type Phase = "idle" | "opening_line" | "verifying" | "connected" | "help";

function connectedResponse(value: unknown): boolean {
  return typeof value === "object"
    && value !== null
    && "connected" in value
    && (value as { connected?: unknown }).connected === true;
}

export function LineOaOnboarding({
  initialStatus,
  surface,
}: {
  initialStatus: LineOaOnboardingStatus;
  surface: "home" | "profile";
}) {
  const [status, setStatus] = useState(initialStatus);
  const [phase, setPhase] = useState<Phase>(
    initialStatus.pairStatus === "paired" ? "connected" : "idle",
  );
  const [dismissed, setDismissed] = useState(false);
  const [dismissError, setDismissError] = useState(false);
  const [isDismissing, startDismiss] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prompt = lineOaHomePrompt(status);

  const clearPolling = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const query = new URLSearchParams({ clubId: status.clubId });
      const result = await fetch(`/api/line-oa/onboarding/status?${query.toString()}`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      if (!result.ok) return false;
      const body: unknown = await result.json();
      if (!connectedResponse(body)) return false;
      setStatus((current) => ({ ...current, friendStatus: "following", pairStatus: "paired" }));
      setPhase("connected");
      clearPolling();
      return true;
    } catch {
      return false;
    }
  }, [clearPolling, status.clubId]);

  const startPolling = useCallback((initialPhase: "opening_line" | "help") => {
    clearPolling();
    let remaining = 6;
    setPhase(initialPhase);

    const tick = async () => {
      setPhase("verifying");
      if (await refresh()) return;
      remaining -= 1;
      if (remaining <= 0) {
        setPhase("help");
        return;
      }
      timerRef.current = setTimeout(tick, 3_000);
    };

    timerRef.current = setTimeout(tick, 3_000);
  }, [clearPolling, refresh]);

  useEffect(() => {
    const onPageShow = () => { void refresh(); };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearPolling();
    };
  }, [clearPolling, refresh]);

  if (surface === "home" && (prompt === "hidden" || dismissed)) return null;

  const connected = phase === "connected" || status.pairStatus === "paired";
  const unavailable = !status.oaAvailable || !status.joinUrl;
  const className = [
    styles.panel,
    surface === "profile" ? styles.profile : "",
    surface === "home" && prompt === "full" ? styles.full : "",
    surface === "home" && prompt === "quiet" ? styles.quiet : "",
  ].filter(Boolean).join(" ");

  return <section className={className} aria-labelledby={`line-oa-title-${status.clubId}`}>
    <div className={styles.icon} aria-hidden="true">LINE</div>
    <div className={styles.content}>
      <p className={styles.eyebrow}>本社重要通知</p>
      <h2 id={`line-oa-title-${status.clubId}`}>
        {connected ? `已連接「${status.clubName}」LINE` : `加入「${status.clubName}」LINE 官方帳號`}
      </h2>
      {connected ? <p>您已完成好友與社員身份確認，可以接收本社開啟的 LINE 通知。</p>
        : unavailable ? <p>本社 LINE 官方帳號尚未完成安全驗證，暫時不提供加入連結。</p>
          : <p>接收會議提醒與重要社務通知，不錯過社內消息。</p>}

      {status.pairStatus === "conflict" && <p className={styles.warning} role="alert">
        目前的 LINE 連接資料需要社務幹部協助確認；系統不會自動覆蓋既有社員。
      </p>}
      {phase === "verifying" && <p className={styles.progress} role="status">正在確認是否完成連接…</p>}
      {phase === "help" && <p className={styles.progress} role="status">
        還沒確認到連接。若您原本就是好友，請開啟聊天室；目前仍可由社務幹部協助配對。
      </p>}
      {dismissError && <p className={styles.warning} role="alert">目前無法儲存提醒時間，請稍後再試。</p>}

      {!connected && !unavailable && status.pairStatus !== "conflict" && <div className={styles.actions}>
        <a
          className="button line-button"
          href={status.joinUrl ?? undefined}
          target="_blank"
          rel="noreferrer"
          onClick={() => startPolling("opening_line")}
        >
          加入本社 LINE
        </a>
        <a
          className="button button-secondary"
          href={status.joinUrl ?? undefined}
          target="_blank"
          rel="noreferrer"
          onClick={() => startPolling("help")}
        >
          我已經是好友
        </a>
        {surface === "home" && <button
          type="button"
          className={styles.later}
          disabled={isDismissing}
          onClick={() => startDismiss(async () => {
            setDismissError(false);
            const result = await dismissLineOaOnboardingAction(status.clubId);
            if (result.ok) setDismissed(true);
            else setDismissError(true);
          })}
        >
          {isDismissing ? "正在儲存…" : "稍後再說"}
        </button>}
      </div>}
      {phase === "opening_line" && <p className={styles.progress} role="status">已開啟 LINE，完成後請回到這個畫面。</p>}
    </div>
  </section>;
}

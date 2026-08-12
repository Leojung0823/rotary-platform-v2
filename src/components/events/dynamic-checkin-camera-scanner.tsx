"use client";

import jsQR from "jsqr";
import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  selfDynamicCheckinAction,
  type DynamicSelfCheckinActionState,
} from "@/app/checkin-actions";
import { normalizeScannedCheckinToken } from "@/lib/checkin/scan";
import styles from "./checkin-scanner.module.css";

type BarcodeResult = { rawValue?: string; format?: string };
type BarcodeDetectorInstance = { detect(source: HTMLVideoElement): Promise<BarcodeResult[]> };
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;
type ScannerStatus = "idle" | "starting" | "scanning" | "unsupported" | "denied" | "error" | "submitting";
const initialDynamicSelfCheckinActionState: DynamicSelfCheckinActionState = { status: "idle" };

function browserBarcodeDetector() {
  return (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
}

function scanWithCanvas(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width <= 0 || height <= 0) return null;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(video, 0, 0, width, height);
  const image = context.getImageData(0, 0, width, height);
  return jsQR(image.data, width, height, { inversionAttempts: "dontInvert" })?.data ?? null;
}

export function DynamicCheckinCameraScanner() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const cameraRequestRef = useRef(0);
  const activeRef = useRef(false);
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [actionState, action, actionPending] = useActionState(selfDynamicCheckinAction, initialDynamicSelfCheckinActionState);
  const [transitionPending, startTransition] = useTransition();

  const stopCamera = useCallback(() => {
    cameraRequestRef.current += 1;
    activeRef.current = false;
    if (scanTimerRef.current !== null) {
      window.clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") {
        stopCamera();
        setStatus("idle");
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      stopCamera();
    };
  }, [stopCamera]);

  const submitScannedCredential = useCallback((credential: string) => {
    stopCamera();
    setStatus("submitting");
    const formData = new FormData();
    formData.set("credential", credential);
    startTransition(() => action(formData));
  }, [action, startTransition, stopCamera]);

  const startCamera = useCallback(async () => {
    stopCamera();
    const requestId = cameraRequestRef.current;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      return;
    }
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (requestId !== cameraRequestRef.current || document.visibilityState !== "visible") {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        setStatus("error");
        return;
      }
      const Detector = browserBarcodeDetector();
      const detector = Detector ? new Detector({ formats: ["qr_code"] }) : null;
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      if (requestId !== cameraRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      activeRef.current = true;
      setStatus("scanning");

      const scan = async () => {
        if (!activeRef.current) return;
        const currentVideo = videoRef.current;
        try {
          let scannedValue: string | null = null;
          if (currentVideo && currentVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            if (detector) {
              const results = await detector.detect(currentVideo);
              scannedValue = results.find((result) => !result.format || result.format === "qr_code")?.rawValue ?? null;
            } else if (canvasRef.current) {
              scannedValue = scanWithCanvas(currentVideo, canvasRef.current);
            }
          }
          if (!activeRef.current || requestId !== cameraRequestRef.current) return;
          const credential = normalizeScannedCheckinToken(scannedValue);
          if (credential) {
            submitScannedCredential(credential);
            return;
          }
        } catch {
          if (!activeRef.current || requestId !== cameraRequestRef.current) return;
          stopCamera();
          setStatus("error");
          return;
        }
        if (activeRef.current && requestId === cameraRequestRef.current) {
          scanTimerRef.current = window.setTimeout(() => void scan(), 250);
        }
      };
      void scan();
    } catch (error) {
      if (requestId !== cameraRequestRef.current) return;
      stopCamera();
      const name = error instanceof DOMException ? error.name : "";
      setStatus(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error");
    }
  }, [stopCamera, submitScannedCredential]);

  const busy = status === "starting" || status === "submitting" || actionPending || transitionPending;
  const resultMessage = actionState.status === "success"
    ? actionState.result === "already_checked_in" ? "您已完成此活動簽到，系統沒有建立重複紀錄。" : "簽到成功，系統已記錄您的社員社籍與簽到時間。"
    : actionState.status === "error"
      ? actionState.code === "expired" ? "QR 已過期或已被立即更換，請掃描現場最新 QR。" : actionState.code === "session_closed" ? "簽到場次已關閉，請向現場管理者確認。" : actionState.code === "forbidden" ? "目前帳號不是該社有效社員，無法使用此 QR。" : "目前無法完成簽到，請重新掃描或稍後再試。"
      : null;

  return <section className="card form-stack">
    <div className="section-heading">
      <div><p className="eyebrow">手機掃描</p><h2>掃描現場 QR</h2></div>
      <span>不保存影像</span>
    </div>
    <div className={styles.cameraFrame} data-active={status === "scanning" ? "true" : "false"}>
      <video ref={videoRef} muted playsInline aria-label="活動簽到相機預覽" />
      <canvas ref={canvasRef} className="sr-only" aria-hidden="true" />
      {status !== "scanning" && <div className={styles.cameraPlaceholder} aria-live="polite">
        {status === "starting" ? "正在啟動相機…" : busy ? "已讀取 QR，正在確認簽到…" : "相機只會在您點擊後啟動"}
      </div>}
      {status === "scanning" && <div className={styles.cameraGuide} aria-hidden="true" />}
    </div>
    {status === "unsupported" && <div className="notice notice-info" role="status">此網址或瀏覽器不支援安全相機。請請現場管理者以人工補登，不需要輸入長 token。</div>}
    {status === "denied" && <div className="notice notice-error" role="alert">相機權限未允許。調整瀏覽器權限後可重試，或請現場管理者人工補登。</div>}
    {status === "error" && <div className="notice notice-error" role="alert">無法讀取相機或 QR。系統沒有上傳任何影像；請重試或請管理者人工補登。</div>}
    {status === "scanning" && <div className="notice notice-info" role="status">將現場 QR 放入框內。辨識成功後會先關閉相機，再由伺服器確認簽到。</div>}
    {resultMessage && <div className={`notice ${actionState.status === "success" ? "notice-success" : "notice-error"}`} role={actionState.status === "success" ? "status" : "alert"}>{resultMessage}</div>}
    <div className={styles.cameraActions}>
      {status !== "scanning" && <button className="button" type="button" onClick={() => void startCamera()} disabled={busy}>{busy ? "處理中…" : "啟動後鏡頭掃描"}</button>}
      {status === "scanning" && <button className="button button-secondary" type="button" onClick={() => { stopCamera(); setStatus("idle"); }}>停止相機</button>}
    </div>
    <p className="hint">iPhone Safari 若沒有 BarcodeDetector，會改由裝置內的 QR decoder 處理影像畫面；影像與 QR 值均不會上傳、寫入或保存在瀏覽器。</p>
  </section>;
}

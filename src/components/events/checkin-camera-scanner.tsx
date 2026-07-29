"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { selfCheckinAction } from "@/app/checkin-actions";
import { normalizeScannedCheckinToken } from "@/lib/checkin/scan";
import styles from "./checkin-scanner.module.css";

type BarcodeResult = { rawValue?: string; format?: string };
type BarcodeDetectorInstance = { detect(source: HTMLVideoElement): Promise<BarcodeResult[]> };
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;
type ScannerStatus = "idle" | "starting" | "scanning" | "unsupported" | "denied" | "error" | "submitting";

function browserBarcodeDetector() {
  return (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
}

export function CheckinCameraScanner() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const cameraRequestRef = useRef(0);
  const activeRef = useRef(false);
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [isPending, startTransition] = useTransition();

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

  const submitScannedToken = useCallback((token: string) => {
    stopCamera();
    setStatus("submitting");
    const formData = new FormData();
    formData.set("token", token);
    startTransition(() => {
      void selfCheckinAction(formData);
    });
  }, [startTransition, stopCamera]);

  const startCamera = useCallback(async () => {
    stopCamera();
    const requestId = cameraRequestRef.current;
    const Detector = browserBarcodeDetector();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !Detector) {
      setStatus("unsupported");
      return;
    }

    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
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

      const detector = new Detector({ formats: ["qr_code"] });
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
        if (currentVideo && currentVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          try {
            const results = await detector.detect(currentVideo);
            if (!activeRef.current || requestId !== cameraRequestRef.current) return;
            for (const result of results) {
              if (result.format && result.format !== "qr_code") continue;
              const token = normalizeScannedCheckinToken(result.rawValue);
              if (token) {
                submitScannedToken(token);
                return;
              }
            }
          } catch {
            if (!activeRef.current || requestId !== cameraRequestRef.current) return;
            stopCamera();
            setStatus("error");
            return;
          }
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
  }, [stopCamera, submitScannedToken]);

  const handleStop = () => {
    stopCamera();
    setStatus("idle");
  };

  const busy = status === "starting" || status === "submitting" || isPending;

  return <section className="card form-stack">
    <div className="section-heading">
      <div><p className="eyebrow">手機掃描</p><h2>掃描現場 QR</h2></div>
      <span>不保存影像</span>
    </div>

    <div className={styles.cameraFrame} data-active={status === "scanning" ? "true" : "false"}>
      <video ref={videoRef} muted playsInline aria-label="活動簽到相機預覽" />
      {status !== "scanning" && <div className={styles.cameraPlaceholder} aria-live="polite">
        {status === "starting" ? "正在啟動相機…" : status === "submitting" || isPending ? "已讀取 QR，正在完成簽到…" : "相機只會在您點擊後啟動"}
      </div>}
      {status === "scanning" && <div className={styles.cameraGuide} aria-hidden="true" />}
    </div>

    {status === "unsupported" && <div className="notice notice-info" role="status">
      此瀏覽器或目前網址不支援安全相機掃描，請使用下方手動輸入。相機通常需要 HTTPS，且瀏覽器必須支援 QR 偵測。
    </div>}
    {status === "denied" && <div className="notice notice-error" role="alert">
      相機權限未允許。您可以調整瀏覽器權限後重試，或改用下方手動輸入。
    </div>}
    {status === "error" && <div className="notice notice-error" role="alert">
      無法啟動或讀取相機。系統沒有上傳任何影像，請改用下方手動輸入。
    </div>}
    {status === "scanning" && <div className="notice notice-info" role="status">
      將現場 QR 放入框內。辨識成功後會先關閉相機，再提交本人簽到。
    </div>}

    <div className={styles.cameraActions}>
      {status !== "scanning" && <button className="button" type="button" onClick={() => void startCamera()} disabled={busy}>
        {busy ? "處理中…" : "啟動後鏡頭掃描"}
      </button>}
      {status === "scanning" && <button className="button button-secondary" type="button" onClick={handleStop}>停止相機</button>}
    </div>

    <p className="hint">相機串流只存在目前瀏覽器記憶體；離開頁面、切到背景、停止掃描或辨識成功時，系統會停止所有相機 tracks。</p>
  </section>;
}

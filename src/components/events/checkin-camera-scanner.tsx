"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmQrCheckinAction, previewQrCheckinAction, recordClientCheckinFailureAction, type QrPreviewResult } from "@/app/checkin-actions";
import { formatDateTime } from "@/lib/member-experience";
import { normalizeScannedCheckinToken } from "@/lib/checkin/scan";
import styles from "./checkin-scanner.module.css";

type BarcodeResult = { rawValue?: string; format?: string };
type BarcodeDetectorInstance = { detect(source: HTMLVideoElement): Promise<BarcodeResult[]> };
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;
type ScannerStatus = "idle" | "starting" | "scanning" | "unsupported" | "denied" | "error" | "reading" | "confirming";

const errorMessages: Record<string, string> = {
  credential_invalid: "這個 QR Code 無法辨識，請掃描現場最新顯示的 QR Code。",
  credential_expired: "這個簽到 QR Code 已失效，請掃描現場最新的 QR Code。",
  session_closed: "現場 QR Code 簽到已結束，請洽現場工作人員協助。",
  window_closed: "目前不在活動簽到時間內，請確認活動時間或洽現場工作人員。",
  not_eligible: "您目前不具備這場活動的簽到資格，請洽扶輪社秘書協助。",
  rate_limited: "嘗試次數過多，請稍候一分鐘再試。",
  wrong_event: "這個 QR Code 屬於另一場活動，請掃描本活動現場顯示的 QR Code。",
  unexpected: "簽到暫時無法完成，請重新掃描；若問題持續，請洽現場工作人員。",
};

function browserBarcodeDetector() {
  return (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
}

export function CheckinCameraScanner({ expectedEventId, loadCapturedCredential = false }: { expectedEventId?: string; loadCapturedCredential?: boolean }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const requestRef = useRef(0);
  const activeRef = useRef(false);
  const handledCapturedRef = useRef(false);
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [credential, setCredential] = useState<string | null>(null);
  const [preview, setPreview] = useState<Extract<QrPreviewResult, { status: "ready" }> | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const stopCamera = useCallback(() => {
    requestRef.current += 1;
    activeRef.current = false;
    if (scanTimerRef.current !== null) window.clearTimeout(scanTimerRef.current);
    scanTimerRef.current = null;
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

  const inspectCredential = useCallback((token: string) => {
    stopCamera();
    setStatus("reading");
    setErrorCode(null);
    startTransition(async () => {
      const result = await previewQrCheckinAction(token);
      if (result.status === "error") {
        setCredential(null);
        setPreview(null);
        setErrorCode(result.code);
        setStatus("idle");
        return;
      }
      if (expectedEventId && result.eventId !== expectedEventId) {
        setCredential(null);
        setPreview(null);
        setErrorCode("wrong_event");
        setStatus("idle");
        return;
      }
      setCredential(token);
      setPreview(result);
      setStatus("idle");
    });
  }, [expectedEventId, stopCamera]);

  useEffect(() => {
    if (!loadCapturedCredential || handledCapturedRef.current) return;
    handledCapturedRef.current = true;
    const stored = window.sessionStorage.getItem("rotary_checkin_credential");
    window.sessionStorage.removeItem("rotary_checkin_credential");
    const token = normalizeScannedCheckinToken(stored);
    queueMicrotask(() => {
      if (token) inspectCredential(token);
      else setErrorCode("credential_invalid");
    });
  }, [inspectCredential, loadCapturedCredential]);

  const startCamera = useCallback(async () => {
    stopCamera();
    const requestId = requestRef.current;
    const Detector = browserBarcodeDetector();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !Detector) {
      setStatus("unsupported");
      if (expectedEventId) void recordClientCheckinFailureAction(expectedEventId, "qr", "camera_unsupported");
      return;
    }
    setCredential(null);
    setPreview(null);
    setErrorCode(null);
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" } } });
      if (requestId !== requestRef.current) return stream.getTracks().forEach((track) => track.stop());
      const video = videoRef.current;
      if (!video) throw new Error("video_unavailable");
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      const detector = new Detector({ formats: ["qr_code"] });
      activeRef.current = true;
      setStatus("scanning");
      const scan = async () => {
        if (!activeRef.current) return;
        try {
          const results = await detector.detect(video);
          for (const result of results) {
            const token = normalizeScannedCheckinToken(result.rawValue);
            if (token) return inspectCredential(token);
          }
        } catch {
          stopCamera();
          setStatus("error");
          if (expectedEventId) void recordClientCheckinFailureAction(expectedEventId, "qr", "camera_error");
          return;
        }
        scanTimerRef.current = window.setTimeout(() => void scan(), 250);
      };
      void scan();
    } catch (error) {
      stopCamera();
      const name = error instanceof DOMException ? error.name : "";
      const denied = name === "NotAllowedError" || name === "SecurityError";
      setStatus(denied ? "denied" : "error");
      if (expectedEventId) void recordClientCheckinFailureAction(expectedEventId, "qr", denied ? "camera_permission_denied" : "camera_error");
    }
  }, [expectedEventId, inspectCredential, stopCamera]);

  const confirm = () => {
    if (!credential) return;
    setStatus("confirming");
    startTransition(async () => {
      const result = await confirmQrCheckinAction(credential);
      if (result.status === "success") {
        router.push(`/events/checkin/success?attendanceId=${encodeURIComponent(result.attendanceId)}`);
        return;
      }
      setCredential(null);
      setPreview(null);
      setErrorCode(result.code);
      setStatus("idle");
    });
  };

  if (preview) return <section className="card form-stack" aria-labelledby="qr-confirm-title">
    <div><p className="selected-club-name">請確認活動</p><h2 id="qr-confirm-title">{preview.title}</h2></div>
    <dl className="event-facts"><div><dt>日期與時間</dt><dd>{formatDateTime(preview.startsAt, true)}</dd></div><div><dt>地點</dt><dd>{preview.location || "地點將另行通知"}</dd></div></dl>
    <button className="button button-full" type="button" onClick={confirm} disabled={isPending}>{status === "confirming" ? "正在完成簽到……" : "確認簽到"}</button>
    <button className="button button-secondary button-full" type="button" onClick={() => { setPreview(null); setCredential(null); }}>重新掃描</button>
  </section>;

  const busy = status === "starting" || status === "reading" || isPending;
  return <section className="card form-stack">
    <div className="section-heading"><h2>掃描現場 QR Code</h2></div>
    <div className={styles.cameraFrame} data-active={status === "scanning" ? "true" : "false"}>
      <video ref={videoRef} muted playsInline aria-label="活動簽到相機預覽" />
      {status !== "scanning" && <div className={styles.cameraPlaceholder} aria-live="polite">{status === "starting" ? "正在啟動相機……" : status === "reading" ? "正在確認活動……" : "點擊下方按鈕後，將 QR Code 放入框內"}</div>}
      {status === "scanning" && <div className={styles.cameraGuide} aria-hidden="true" />}
    </div>
    {errorCode && <div className="notice notice-error" role="alert">{errorMessages[errorCode] ?? errorMessages.unexpected}</div>}
    {status === "unsupported" && <div className="notice notice-info" role="status">目前瀏覽器無法使用平台內掃描。請改用手機內建相機掃描現場 QR Code；仍無法完成時，請洽現場工作人員人工補登。</div>}
    {status === "denied" && <div className="notice notice-error" role="alert">相機權限尚未開啟。請到瀏覽器網站設定允許相機後再試一次；也可使用手機內建相機掃描，或請現場工作人員協助。</div>}
    {status === "error" && <div className="notice notice-error" role="alert">目前無法讀取相機。請關閉其他使用相機的程式後再試，或請現場工作人員人工補登。</div>}
    <div className={styles.cameraActions}>
      {status === "scanning" ? <button className="button button-secondary" type="button" onClick={() => { stopCamera(); setStatus("idle"); }}>停止掃描</button>
        : <button className="button" type="button" onClick={() => void startCamera()} disabled={busy}>{busy ? "處理中……" : "掃描簽到 QR"}</button>}
    </div>
    <p className="hint">平台只在您主動啟動時使用相機，不會儲存或上傳相機影像。</p>
  </section>;
}

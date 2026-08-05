"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import styles from "./checkin-scanner.module.css";

type QrResult = {
  token: string;
  dataUrl: string | null;
  failed: boolean;
};

export function CheckinQrCode({ value }: { value: string }) {
  const [result, setResult] = useState<QrResult | null>(null);

  useEffect(() => {
    let active = true;

    QRCode.toDataURL(value, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 512,
      type: "image/png",
    }).then((dataUrl) => {
      if (active) setResult({ token: value, dataUrl, failed: false });
    }).catch(() => {
      if (active) setResult({ token: value, dataUrl: null, failed: true });
    });

    return () => {
      active = false;
    };
  }, [value]);

  const current = result?.token === value ? result : null;
  if (current?.failed) {
    return <div className={styles.qrPlaceholder} role="alert">QR 圖片產生失敗，請重新產生或聯絡現場工作人員。</div>;
  }

  if (!current?.dataUrl) {
    return <div className={styles.qrPlaceholder} role="status">正在產生 QR…</div>;
  }

  return <Image src={current.dataUrl} alt="現場活動簽到 QR Code" width={512} height={512} unoptimized draggable={false} />;
}

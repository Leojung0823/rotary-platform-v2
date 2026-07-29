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

export function CheckinQrCode({ token }: { token: string }) {
  const [result, setResult] = useState<QrResult | null>(null);

  useEffect(() => {
    let active = true;

    QRCode.toDataURL(token, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 512,
      type: "image/png",
    }).then((value) => {
      if (active) setResult({ token, dataUrl: value, failed: false });
    }).catch(() => {
      if (active) setResult({ token, dataUrl: null, failed: true });
    });

    return () => {
      active = false;
    };
  }, [token]);

  const current = result?.token === token ? result : null;
  if (current?.failed) {
    return <div className={styles.qrPlaceholder} role="alert">QR 圖片產生失敗，仍可使用右側一次性 token。</div>;
  }

  if (!current?.dataUrl) {
    return <div className={styles.qrPlaceholder} role="status">正在產生 QR…</div>;
  }

  return <Image src={current.dataUrl} alt="活動簽到 QR code" width={512} height={512} unoptimized draggable={false} />;
}

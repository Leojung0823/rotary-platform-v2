"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function CheckinQrCode({ token }: { token: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setDataUrl(null);
    setFailed(false);

    QRCode.toDataURL(token, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 512,
      type: "image/png",
    }).then((value) => {
      if (active) setDataUrl(value);
    }).catch(() => {
      if (active) setFailed(true);
    });

    return () => {
      active = false;
      setDataUrl(null);
    };
  }, [token]);

  if (failed) {
    return <div className="qr-placeholder" role="alert">QR 圖片產生失敗，仍可使用右側一次性 token。</div>;
  }

  if (!dataUrl) {
    return <div className="qr-placeholder" role="status">正在產生 QR…</div>;
  }

  return <img src={dataUrl} alt="活動簽到 QR code" draggable={false} />;
}

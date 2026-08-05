import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) { return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"); }

describe("dynamic check-in QR presentation boundary", () => {
  const qr = source("components/events/checkin-qr-code.tsx");
  const dynamic = source("components/events/dynamic-checkin-qr.tsx");
  const capture = source("components/events/checkin-link-capture.tsx");

  it("renders only a dynamic QR image and rotates it from controlled server actions", () => {
    expect(qr).toContain("QRCode.toDataURL(value");
    expect(dynamic).toContain("issueDynamicQrAction(clubId, eventId)");
    expect(dynamic).toContain("window.setTimeout(refresh, delay)");
    expect(dynamic).toContain("/checkin#");
    expect(dynamic).not.toContain("textarea");
    expect(dynamic).not.toContain("一次性 token");
  });

  it("keeps credentials out of query strings and clears the fragment immediately", () => {
    expect(capture).toContain('window.history.replaceState(null, "", "/checkin")');
    expect(capture).toContain('sessionStorage.setItem("rotary_checkin_credential"');
    expect(dynamic).not.toContain('?token=');
    expect(qr).not.toContain("fetch(");
    expect(qr).not.toContain("localStorage");
  });
});

describe("check-in camera boundary", () => {
  const scanner = source("components/events/checkin-camera-scanner.tsx");
  const page = source("app/(authenticated)/events/checkin/page.tsx");

  it("starts only after a click, asks for the environment camera, and detects QR only", () => {
    expect(scanner).toContain("navigator.mediaDevices.getUserMedia");
    expect(scanner).toContain('facingMode: { ideal: "environment" }');
    expect(scanner).toContain('new Detector({ formats: ["qr_code"] })');
    expect(scanner).toContain("normalizeScannedCheckinToken(result.rawValue)");
    expect(scanner).toContain("onClick={() => void startCamera()}");
  });

  it("stops media tracks on cleanup and backgrounding", () => {
    expect(scanner).toContain("getTracks().forEach((track) => track.stop())");
    expect(scanner).toContain('document.addEventListener("visibilitychange"');
    expect(scanner).toContain('document.removeEventListener("visibilitychange"');
  });

  it("previews event details before confirmation and has no manual credential input", () => {
    expect(scanner).toContain("previewQrCheckinAction(token)");
    expect(scanner).toContain("confirmQrCheckinAction(credential)");
    expect(scanner).toContain("請確認活動");
    expect(page).toContain("<CheckinCameraScanner");
    expect(page).not.toContain('name="token"');
    expect(page).toContain("平台不會要求您手動輸入長字串");
  });
});

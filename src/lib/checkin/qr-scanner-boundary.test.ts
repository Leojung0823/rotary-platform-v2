import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("check-in QR presentation boundary", () => {
  const qr = source("components/events/checkin-qr-code.tsx");
  const controls = source("components/events/checkin-token-controls.tsx");

  it("generates a local data URL from the one-time action-state token", () => {
    expect(qr).toContain("QRCode.toDataURL(token");
    expect(qr).toContain('type: "image/png"');
    expect(controls).toContain("<CheckinQrCode token={state.token} />");
    expect(controls).toContain('rotateState.status !== "success"');
  });

  it("does not send or persist the raw token while rendering the QR", () => {
    for (const forbidden of ["fetch(", "localStorage", "sessionStorage", "console.", "URLSearchParams"]) {
      expect(qr).not.toContain(forbidden);
    }
    expect(qr).not.toContain("download=");
    expect(controls).not.toContain('params.set("token"');
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

  it("stops media tracks on exit paths and when the page becomes hidden", () => {
    expect(scanner).toContain("getTracks().forEach((track) => track.stop())");
    expect(scanner).toContain('document.addEventListener("visibilitychange"');
    expect(scanner).toContain("stopCamera();\n    setStatus(\"submitting\")");
    expect(scanner).toContain("return () => {");
  });

  it("submits through the existing server action without token URLs or browser persistence", () => {
    expect(scanner).toContain('formData.set("token", token)');
    expect(scanner).toContain("selfCheckinAction(formData)");
    for (const forbidden of ["fetch(", "localStorage", "sessionStorage", "console.", 'params.set("token"', "location.href"] ) {
      expect(scanner).not.toContain(forbidden);
    }
    expect(page).toContain("<CheckinCameraScanner />");
    expect(page).toContain('name="token"');
  });
});

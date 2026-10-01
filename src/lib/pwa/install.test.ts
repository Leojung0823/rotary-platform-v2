import { describe, expect, it } from "vitest";
import {
  detectEmbeddedBrowser,
  detectInstallPlatform,
  externalInstallUrl,
  installCardDismissalExpiresAt,
  isInstallCardDismissed,
  INSTALL_DISMISSAL_MS,
  withLineExternalBrowser,
} from "./install";

describe("mobile installation guidance", () => {
  it("recognizes iPhone, iPadOS touch devices, Android, and desktop", () => {
    expect(detectInstallPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("ios");
    expect(detectInstallPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X)", "MacIntel", 5)).toBe("ios");
    expect(detectInstallPlatform("Mozilla/5.0 (Linux; Android 15; Pixel)")).toBe("android");
    expect(detectInstallPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("other");
  });

  it("detects common embedded browsers so the page can show external-open instructions", () => {
    expect(detectEmbeddedBrowser("Mozilla/5.0 (iPhone) Line/14.2.0")).toBe("line");
    expect(detectEmbeddedBrowser("Mozilla/5.0 (iPhone) FBAN/FBIOS FBAV/400.0")).toBe("facebook");
    expect(detectEmbeddedBrowser("Mozilla/5.0 (Linux; Android 14; wv)")).toBe("other");
    expect(detectEmbeddedBrowser("Mozilla/5.0 (iPhone) Version/17.0 Mobile Safari/604.1")).toBeNull();
  });

  it("adds the LINE external-browser query without replacing existing query or hash data", () => {
    expect(withLineExternalBrowser("/install?source=qr#steps"))
      .toBe("/install?source=qr&openExternalBrowser=1#steps");
    expect(withLineExternalBrowser("https://example.com/install?openExternalBrowser=0&source=line"))
      .toBe("https://example.com/install?openExternalBrowser=1&source=line");
    expect(externalInstallUrl("https://example.com")).toBe("https://example.com/install?openExternalBrowser=1");
  });

  it("does not rewrite LIFF URLs because LINE ignores the external-browser parameter there", () => {
    const liffUrl = "https://liff.line.me/1234567890-AbcdEfgh/path?source=chat";
    expect(withLineExternalBrowser(liffUrl)).toBe(liffUrl);
  });

  it("keeps a dismissed install card away for exactly seven days", () => {
    const now = 1_800_000_000_000;
    const expiry = installCardDismissalExpiresAt(now);
    expect(expiry - now).toBe(7 * 24 * 60 * 60 * 1000);
    expect(INSTALL_DISMISSAL_MS).toBe(expiry - now);
    expect(isInstallCardDismissed(String(expiry), now)).toBe(true);
    expect(isInstallCardDismissed(String(expiry), expiry)).toBe(false);
    expect(isInstallCardDismissed("not-a-timestamp", now)).toBe(false);
  });
});

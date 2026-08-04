import { describe, expect, it } from "vitest";
import { trustedSiteRedirect, trustedSiteUrl } from "./site-url";

describe("trustedSiteUrl", () => {
  it("uses the configured public HTTPS origin in hosted environments", () => {
    const environment = {
      APP_ENV: "staging",
      NEXT_PUBLIC_SITE_URL: "https://rotary-platform-v2.onrender.com",
      RENDER_EXTERNAL_URL: "https://fallback.onrender.com",
    };

    expect(trustedSiteUrl(environment).href).toBe("https://rotary-platform-v2.onrender.com/");
  });

  it("falls back to Render when the configured hosted origin is internal", () => {
    const environment = {
      APP_ENV: "staging",
      NEXT_PUBLIC_SITE_URL: "http://0.0.0.0:10000",
      RENDER_EXTERNAL_URL: "https://rotary-platform-v2.onrender.com",
    };

    expect(trustedSiteRedirect("/reset-password", environment).href)
      .toBe("https://rotary-platform-v2.onrender.com/reset-password");
  });

  it("uses the public Render origin even when APP_ENV is missing", () => {
    const environment = {
      NEXT_PUBLIC_SITE_URL: "http://0.0.0.0:10000",
      RENDER_EXTERNAL_URL: "https://rotary-platform-v2.onrender.com",
    };

    expect(trustedSiteRedirect("/reset-password", environment).href)
      .toBe("https://rotary-platform-v2.onrender.com/reset-password");
  });

  it("uses the public Render origin even when APP_ENV is incorrectly local", () => {
    const environment = {
      APP_ENV: "local",
      NEXT_PUBLIC_SITE_URL: "http://0.0.0.0:10000",
      RENDER_EXTERNAL_URL: "https://rotary-platform-v2.onrender.com",
    };

    expect(trustedSiteRedirect("/reset-password", environment).href)
      .toBe("https://rotary-platform-v2.onrender.com/reset-password");
  });

  it("rejects hosted environments without a public HTTPS origin", () => {
    const environment = {
      APP_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      RENDER_EXTERNAL_URL: "http://0.0.0.0:10000",
    };

    expect(() => trustedSiteUrl(environment)).toThrow("Hosted site URL is not configured.");
  });

  it("fails closed on Render when APP_ENV is wrong and both configured origins are unsafe", () => {
    const environment = {
      APP_ENV: "local",
      RENDER: "true",
      NODE_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://10.0.0.8",
      RENDER_EXTERNAL_URL: "http://0.0.0.0:10000",
    };

    expect(() => trustedSiteUrl(environment)).toThrow("Hosted site URL is not configured.");
  });

  it("rejects non-public HTTPS hosts and values that are not exact origins", () => {
    for (const NEXT_PUBLIC_SITE_URL of [
      "https://127.0.0.2",
      "https://10.0.0.8",
      "https://172.20.0.5",
      "https://192.168.1.5",
      "https://[fd00::1]",
      "https://rotary-platform-v2.onrender.com/untrusted-path",
      "https://rotary-platform-v2.onrender.com/?untrusted=value",
    ]) {
      expect(() => trustedSiteUrl({
        APP_ENV: "production",
        NEXT_PUBLIC_SITE_URL,
      }), NEXT_PUBLIC_SITE_URL).toThrow("Hosted site URL is not configured.");
    }
  });

  it("keeps production configurable with a public HTTPS origin", () => {
    expect(trustedSiteUrl({
      APP_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://members.rotary.example.com",
    }).href).toBe("https://members.rotary.example.com/");
  });

  it("keeps the local development fallback", () => {
    expect(trustedSiteUrl({ APP_ENV: "local" }).href)
      .toBe("http://localhost:3000/");
  });
});

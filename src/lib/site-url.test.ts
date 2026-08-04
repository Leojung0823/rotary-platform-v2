import { describe, expect, it } from "vitest";
import { trustedSiteRedirect, trustedSiteUrl } from "./site-url";

describe("trustedSiteUrl", () => {
  it("uses the configured public HTTPS origin in hosted environments", () => {
    const environment = {
      APP_ENV: "staging",
      NEXT_PUBLIC_SITE_URL: "https://rotary-platform-v2.onrender.com",
      RENDER_EXTERNAL_URL: "https://fallback.onrender.com",
    } as NodeJS.ProcessEnv;

    expect(trustedSiteUrl(environment).href).toBe("https://rotary-platform-v2.onrender.com/");
  });

  it("falls back to Render when the configured hosted origin is internal", () => {
    const environment = {
      APP_ENV: "staging",
      NEXT_PUBLIC_SITE_URL: "http://0.0.0.0:10000",
      RENDER_EXTERNAL_URL: "https://rotary-platform-v2.onrender.com",
    } as NodeJS.ProcessEnv;

    expect(trustedSiteRedirect("/reset-password", environment).href)
      .toBe("https://rotary-platform-v2.onrender.com/reset-password");
  });

  it("uses the public Render origin even when APP_ENV is missing", () => {
    const environment = {
      NEXT_PUBLIC_SITE_URL: "http://0.0.0.0:10000",
      RENDER_EXTERNAL_URL: "https://rotary-platform-v2.onrender.com",
    } as NodeJS.ProcessEnv;

    expect(trustedSiteRedirect("/reset-password", environment).href)
      .toBe("https://rotary-platform-v2.onrender.com/reset-password");
  });

  it("uses the public Render origin even when APP_ENV is incorrectly local", () => {
    const environment = {
      APP_ENV: "local",
      NEXT_PUBLIC_SITE_URL: "http://0.0.0.0:10000",
      RENDER_EXTERNAL_URL: "https://rotary-platform-v2.onrender.com",
    } as NodeJS.ProcessEnv;

    expect(trustedSiteRedirect("/reset-password", environment).href)
      .toBe("https://rotary-platform-v2.onrender.com/reset-password");
  });

  it("rejects hosted environments without a public HTTPS origin", () => {
    const environment = {
      APP_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      RENDER_EXTERNAL_URL: "http://0.0.0.0:10000",
    } as NodeJS.ProcessEnv;

    expect(() => trustedSiteUrl(environment)).toThrow("Hosted site URL is not configured.");
  });

  it("keeps the local development fallback", () => {
    expect(trustedSiteUrl({ APP_ENV: "local" } as NodeJS.ProcessEnv).href)
      .toBe("http://localhost:3000/");
  });
});

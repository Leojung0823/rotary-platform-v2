import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("PWA cache boundary", () => {
  it("registers the worker only as an optional production enhancement", () => {
    const registration = source("src/components/service-worker-registration.tsx");
    expect(registration).toContain('process.env.NODE_ENV !== "production"');
    expect(registration).toContain('navigator.serviceWorker.register("/sw.js"');
    expect(registration).toContain("return null");
  });

  it("never gives the worker an authenticated or API cache path", () => {
    const worker = source("public/sw.js");
    expect(worker).toContain('request.mode === "navigate"');
    expect(worker).toContain('pathname.startsWith("/_next/static/")');
    expect(worker).not.toMatch(/caches\.(match|put).*api/iu);
    expect(worker).not.toMatch(/caches\.(match|put).*cookie/iu);
    expect(worker).not.toContain("Cache-Control");
  });

  it("ships an installable manifest and an offline safety message", () => {
    const manifest = source("src/app/manifest.ts");
    const offline = source("public/offline.html");
    expect(manifest).toContain('start_url: "/dashboard"');
    expect(manifest).toContain('display: "standalone"');
    expect(manifest).toContain('src: "/icon.svg"');
    expect(offline).toContain("目前沒有網路");
    expect(offline).toContain("不會顯示或保存登入後的內容");
  });

  it("caches only public app-shell assets and revalidates the worker", () => {
    const nextConfig = source("next.config.ts");
    expect(nextConfig).toContain('source: "/icon.svg"');
    expect(nextConfig).toContain('source: "/manifest.webmanifest"');
    expect(nextConfig).toContain('source: "/offline.html"');
    expect(nextConfig).toContain('value: "public, max-age=3600, stale-while-revalidate=86400"');
    expect(nextConfig).toContain('source: "/sw.js"');
    expect(nextConfig).toContain('value: "no-cache"');
    expect(nextConfig.indexOf("if (hosted)")).toBeLessThan(nextConfig.indexOf("const publicAppShellHeaders"));
    expect(nextConfig).not.toContain('source: "/:path*", headers: publicAppShellHeaders');
  });
});

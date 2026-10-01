import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import manifest from "../app/manifest";

function source(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

function binary(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url));
}

describe("PWA cache boundary", () => {
  it("registers the worker only as an optional production enhancement", () => {
    const registration = source("src/components/service-worker-registration.tsx");
    expect(registration).toContain('process.env.NODE_ENV !== "production"');
    expect(registration).toContain('navigator.serviceWorker.register("/sw.js"');
    expect(registration).toContain('fetch("/api/app-version", { cache: "no-store" })');
    expect(registration).toContain('current.buildId !== buildId');
    expect(registration).toContain('if (!updateAvailable) return null');
    expect(registration).toContain('waiting.postMessage({ type: "SKIP_WAITING" })');
    expect(registration).toContain('window.location.reload()');
  });

  it("never gives the worker an authenticated or API cache path", () => {
    const worker = source("public/sw.js");
    expect(worker).toContain('request.mode === "navigate"');
    expect(worker).toContain('pathname.startsWith("/_next/static/")');
    expect(worker).toContain('event.data?.type === "SKIP_WAITING"');
    expect(worker).toContain("event.waitUntil(self.skipWaiting())");
    expect(worker).toContain('url.pathname.startsWith("/_next/static/")');
    expect(worker).toContain('const STATIC_CACHE = "rotary-static-v2"');
    expect(worker).not.toContain(".then(() => self.skipWaiting())");
    expect(worker).not.toMatch(/caches\.(match|put).*api/iu);
    expect(worker).not.toMatch(/caches\.(match|put).*cookie/iu);
    expect(worker).not.toContain("Cache-Control");
  });

  it("leaves APIs untouched and uses the network before an offline navigation fallback", async () => {
    const handlers = new Map<string, (event: Record<string, unknown>) => void>();
    const cacheMatches: string[] = [];
    const deletedCaches: string[] = [];
    const cacheWrites: string[] = [];
    const offlineResponse = { kind: "offline" };
    const networkResponse = { kind: "network", ok: true, clone() { return { kind: "network-copy" }; } };
    const cachedIconResponse = { kind: "cached-icon" };
    const cachedChunkResponse = { kind: "cached-chunk" };
    let fetchCalls = 0;
    let shouldFailNetwork = false;
    let skipWaitingCount = 0;
    let activation: Promise<unknown> | undefined;
    const cache = {
      async match(request: { url?: string } | string) {
        const key = typeof request === "string" ? request : request.url ?? "";
        cacheMatches.push(key);
        if (key === "/offline.html") return offlineResponse;
        if (key.includes("/icons/")) return cachedIconResponse;
        if (key.includes("/_next/static/")) return cachedChunkResponse;
        return undefined;
      },
      async put(request: { url?: string } | string) {
        cacheWrites.push(typeof request === "string" ? request : request.url ?? "");
      },
      async add() {},
    };
    runInNewContext(source("public/sw.js"), {
      URL,
      Response,
      fetch: async () => {
        fetchCalls += 1;
        if (shouldFailNetwork) throw new Error("offline");
        return networkResponse;
      },
      caches: {
        async open() { return cache; },
        async keys() { return ["rotary-static-v1", "another-app-cache"]; },
        async delete(name: string) { deletedCaches.push(name); return true; },
      },
      self: {
        location: { origin: "https://app.example" },
        clients: { async claim() {} },
        addEventListener(type: string, handler: (event: Record<string, unknown>) => void) {
          handlers.set(type, handler);
        },
        skipWaiting() { skipWaitingCount += 1; },
      },
    });

    let apiIntercepted = false;
    handlers.get("fetch")?.({
      request: { method: "GET", mode: "cors", url: "https://app.example/rest/v1/private_rows" },
      respondWith() { apiIntercepted = true; },
    });
    expect(apiIntercepted).toBe(false);

    let onlineNavigation: Promise<unknown> | undefined;
    handlers.get("fetch")?.({
      request: { method: "GET", mode: "navigate", url: "https://app.example/dashboard" },
      respondWith(response: Promise<unknown>) { onlineNavigation = response; },
    });
    expect(await onlineNavigation).toBe(networkResponse);
    expect(cacheMatches).toEqual([]);

    shouldFailNetwork = true;
    let offlineNavigation: Promise<unknown> | undefined;
    handlers.get("fetch")?.({
      request: { method: "GET", mode: "navigate", url: "https://app.example/dashboard" },
      respondWith(response: Promise<unknown>) { offlineNavigation = response; },
    });
    expect(await offlineNavigation).toBe(offlineResponse);
    expect(cacheMatches).toEqual(["/offline.html"]);
    shouldFailNetwork = false;

    handlers.get("message")?.({ data: { type: "NOT_AN_UPDATE" } });
    expect(skipWaitingCount).toBe(0);
    let messageLifetimeExtended = false;
    handlers.get("message")?.({
      data: { type: "SKIP_WAITING" },
      waitUntil() { messageLifetimeExtended = true; },
    });
    expect(skipWaitingCount).toBe(1);
    expect(messageLifetimeExtended).toBe(true);

    let stableAsset: Promise<unknown> | undefined;
    handlers.get("fetch")?.({
      request: { method: "GET", mode: "cors", url: "https://app.example/icons/icon.png" },
      respondWith(response: Promise<unknown>) { stableAsset = response; },
    });
    expect(await stableAsset).toBe(networkResponse);
    expect(cacheWrites).toContain("https://app.example/icons/icon.png");

    shouldFailNetwork = true;
    let offlineStableAsset: Promise<unknown> | undefined;
    handlers.get("fetch")?.({
      request: { method: "GET", mode: "cors", url: "https://app.example/icons/icon.png" },
      respondWith(response: Promise<unknown>) { offlineStableAsset = response; },
    });
    expect(await offlineStableAsset).toBe(cachedIconResponse);

    const fetchCallsBeforeHashedAsset = fetchCalls;
    let hashedAsset: Promise<unknown> | undefined;
    handlers.get("fetch")?.({
      request: { method: "GET", mode: "cors", url: "https://app.example/_next/static/chunks/app.123.js" },
      respondWith(response: Promise<unknown>) { hashedAsset = response; },
    });
    expect(await hashedAsset).toBe(cachedChunkResponse);
    expect(fetchCalls).toBe(fetchCallsBeforeHashedAsset);

    handlers.get("activate")?.({
      waitUntil(promise: Promise<unknown>) { activation = promise; },
    });
    await activation;
    expect(deletedCaches).toEqual(["rotary-static-v1"]);
  });

  it("ships an installable manifest with the product name and required icon sizes", () => {
    const appManifest = manifest();
    const manifestSource = source("src/app/manifest.ts");
    expect(appManifest.id).toBe("/");
    expect(appManifest.name).toBe("我是扶輪人");
    expect(appManifest.short_name).toBe("我是扶輪人");
    expect(appManifest.start_url).toBe("/dashboard");
    expect(appManifest.scope).toBe("/");
    expect(appManifest.display).toBe("standalone");
    expect(appManifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: "/icons/icon-192.png", sizes: "192x192", purpose: "any" }),
      expect.objectContaining({ src: "/icons/icon-512.png", sizes: "512x512", purpose: "any" }),
      expect.objectContaining({ src: "/icons/icon-maskable-512.png", sizes: "512x512", purpose: "maskable" }),
    ]));
    expect(manifestSource).toContain('src: "/icons/icon-maskable-512.png"');
    const layout = source("src/app/layout.tsx");
    expect(layout).toContain('apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180"');
    expect(layout).toContain('title: "我是扶輪人"');
    expect(layout).toContain('themeColor: "#0d6eaa"');
    const generator = source("scripts/generate-pwa-icons.mjs");
    expect(generator).toContain('"apple-touch-icon.png", 180');
    for (const [iconPath, dimension] of [
      ["public/icons/icon-192.png", 192],
      ["public/icons/icon-512.png", 512],
      ["public/icons/icon-maskable-512.png", 512],
      ["public/icons/apple-touch-icon.png", 180],
    ] as const) {
      const png = binary(iconPath);
      expect(png.toString("hex", 0, 8)).toBe("89504e470d0a1a0a");
      expect(png.readUInt32BE(16)).toBe(dimension);
      expect(png.readUInt32BE(20)).toBe(dimension);
    }

    const offline = source("public/offline.html");
    expect(offline).toContain("目前沒有網路");
    expect(offline).toContain("不會顯示或保存登入後的內容");
    expect(offline).toContain("目前沒有網路｜我是扶輪人");
  });

  it("provides the public install route and persistent menu entry", () => {
    const installPage = source("src/app/install/page.tsx");
    const installExperience = source("src/components/pwa/install-experience.tsx");
    const roleAwareMenu = source("src/components/role-aware-app-shell.tsx");
    const legacyMenu = source("src/components/app-shell.tsx");
    expect(installPage).toContain("PwaInstallInstructions");
    expect(installExperience).toContain("加入主畫面");
    expect(installExperience).toContain("加到主畫面");
    expect(installExperience).toContain("稍後再說");
    expect(roleAwareMenu).toContain("INSTALL_PAGE_HREF");
    expect(legacyMenu).toContain("INSTALL_PAGE_HREF");
    expect(source("src/app/api/app-version/route.ts")).toContain('"cache-control": "no-store, max-age=0"');
    expect(source("src/lib/app-build-id.ts")).toContain('join(buildDirectory, "BUILD_ID")');

    for (const homeSurface of [
      "src/app/(authenticated)/dashboard/page.tsx",
      "src/components/role-aware-dashboard.tsx",
      "src/components/member-portal/member-portal-home.tsx",
    ]) {
      const home = source(homeSurface);
      expect(home).toContain("PwaInstallCard");
      expect(home).toContain("<PwaInstallCard />");
    }
  });

  it("keeps the current Supabase browser session on the SSR cookie storage path", () => {
    const browserClient = source("src/lib/supabase/client.ts");
    const serverClient = source("src/lib/supabase/server.ts");
    expect(browserClient).toContain('from "@supabase/ssr"');
    expect(browserClient).toContain("createBrowserClient(url, publishableKey)");
    expect(browserClient).not.toContain("localStorage");
    expect(serverClient).toContain('from "@supabase/ssr"');
    expect(serverClient).toContain("const cookieStore = await cookies()");
    expect(serverClient).toContain("cookieStore.getAll()");
  });

  it("caches only public app-shell assets and revalidates the worker", () => {
    const nextConfig = source("next.config.ts");
    expect(nextConfig).toContain('source: "/icon.svg"');
    expect(nextConfig).toContain('source: "/icons/:path*"');
    expect(nextConfig).toContain('source: "/manifest.webmanifest"');
    expect(nextConfig).toContain('source: "/offline.html"');
    expect(nextConfig).toContain('value: "public, max-age=3600, stale-while-revalidate=86400"');
    expect(nextConfig).toContain('source: "/sw.js"');
    expect(nextConfig).toContain('value: "no-cache"');
    expect(nextConfig.indexOf("if (hosted)")).toBeLessThan(nextConfig.indexOf("const publicAppShellHeaders"));
    expect(nextConfig).not.toContain('source: "/:path*", headers: publicAppShellHeaders');
  });
});

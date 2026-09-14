import type { NextConfig } from "next";

const applicationEnvironment = process.env.APP_ENV ?? "local";
const hosted = applicationEnvironment === "staging" || applicationEnvironment === "production";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera powers QR check-in and geolocation powers location check-in, so both
  // are allowed for this origin only -- never delegated to an embedded frame.
  // Microphone has no feature behind it and stays fully off.
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
];

if (hosted) {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  });
}

const publicAppShellHeaders = [
  ...securityHeaders,
  // These files contain no account, club, role, or permission data. A short
  // browser cache reduces repeat navigation cost without making the
  // authenticated HTML or API responses cacheable.
  { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" },
];

const serviceWorkerHeaders = [
  ...securityHeaders,
  // The worker itself must be revalidated so a new cache policy can take
  // effect promptly after a release.
  { key: "Cache-Control", value: "no-cache" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      { source: "/icon.svg", headers: publicAppShellHeaders },
      { source: "/manifest.webmanifest", headers: publicAppShellHeaders },
      { source: "/offline.html", headers: publicAppShellHeaders },
      { source: "/sw.js", headers: serviceWorkerHeaders },
      { source: "/:path*", headers: securityHeaders },
    ];
  },
};

export default nextConfig;

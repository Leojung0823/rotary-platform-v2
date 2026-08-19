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

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

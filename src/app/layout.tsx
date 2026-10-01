import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { getApplicationBuildId } from "@/lib/app-build-id";
import "./globals.css";

export const metadata: Metadata = {
  title: "扶輪管理平台 V2",
  description: "扶輪社多社管理平台 V2",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "我是扶輪人",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d6eaa",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const buildId = getApplicationBuildId() ?? "";
  return (
    <html lang="zh-Hant">
      <body data-app-build-id={buildId}><a href="#main" className="skip-link">跳至主要內容</a><ServiceWorkerRegistration buildId={buildId} />{children}</body>
    </html>
  );
}

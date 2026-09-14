import type { Metadata } from "next";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: "扶輪管理平台 V2",
  description: "扶輪社多社管理平台 V2",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body><a href="#main" className="skip-link">跳至主要內容</a><ServiceWorkerRegistration />{children}</body>
    </html>
  );
}

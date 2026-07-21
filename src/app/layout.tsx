import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rotary Platform V2",
  description: "扶輪社多社管理平台 V2",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}

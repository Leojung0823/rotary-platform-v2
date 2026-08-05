import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "扶輪社員平台",
  description: "扶輪社員活動、報名、簽到與社內聯絡平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body><a href="#main" className="skip-link">跳至主要內容</a>{children}</body>
    </html>
  );
}

import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { PwaInstallInstructions } from "@/components/pwa/install-experience";
import styles from "@/components/pwa/install-experience.module.css";

export const metadata: Metadata = {
  title: "安裝到手機｜我是扶輪人",
  description: "將「我是扶輪人」加入手機桌面，方便下次直接開啟。",
};

export default function InstallPage() {
  return <main id="main" className={styles.installPage}>
    <div className={styles.installPageInner}>
      <header className={styles.installPageHeader}>
        <Image
          className={styles.installPageLogo}
          src="/icon.svg"
          alt=""
          width={88}
          height={88}
          priority
        />
        <h1>安裝「我是扶輪人」</h1>
        <p>把「我是扶輪人」加入手機桌面，下次一點就開。</p>
      </header>
      <section className={styles.installPanel} aria-label="安裝說明">
        <PwaInstallInstructions />
      </section>
      <Link className={styles.loginLink} href="/login">前往登入</Link>
    </div>
  </main>;
}

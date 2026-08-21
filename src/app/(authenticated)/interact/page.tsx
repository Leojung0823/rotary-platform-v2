import Link from "next/link";
import { ShellIcon, type ShellIconName } from "@/components/shell-icons";
import { requireIdentity } from "@/lib/auth";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import styles from "./interact.module.css";

type InteractionEntry = {
  href: string;
  title: string;
  body: string;
  icon: ShellIconName;
};

export default async function InteractPage() {
  const identity = await requireIdentity();
  // 祝福 IOU renders notFound() when its flag is off, so it is only offered
  // here when it will actually open. The other two carry no flag.
  const blessingIou = await evaluateCurrentFeatureFlag({
    key: "blessing_iou_v1",
    subjectUuid: identity.id,
  });

  const entries: InteractionEntry[] = [
    {
      href: "/board",
      title: "留言板",
      body: "在社內公開留言、回覆與討論。",
      icon: "chat",
    },
    {
      href: "/birthdays",
      title: "生日祝福",
      body: "看看接下來誰過生日，留下今年的祝福。",
      icon: "heart",
    },
  ];
  if (blessingIou.enabled) {
    entries.push({
      href: "/blessings",
      title: "祝福 IOU",
      body: "把祝福分享給本社社員，也可以留下希望捐贈的金額。",
      icon: "heart",
    });
  }

  return <div className="page-stack">
    <header className="page-header">
      <div>
        <p className="eyebrow">社員交流</p>
        <h1>社內互動</h1>
        <p>社內的交流功能都在這裡。每一項都只在您所屬的扶輪社內可見。</p>
      </div>
    </header>

    <div className={styles.grid}>
      {entries.map((entry) => <Link key={entry.href} href={entry.href} className={styles.card}>
        <span className={styles.icon}><ShellIcon name={entry.icon} /></span>
        <span className={styles.text}>
          <strong>{entry.title}</strong>
          <small>{entry.body}</small>
        </span>
        <span className={styles.chevron} aria-hidden="true">→</span>
      </Link>)}
    </div>
  </div>;
}

import Link from "next/link";
import styles from "./notification-bell.module.css";
import type { PortalAnnouncement } from "@/lib/member-portal/types";

/** What the bell drops down: the same notices the page lists, in brief. */
export function NotificationBellItems({ items }: { items: readonly PortalAnnouncement[] }) {
  if (items.length === 0) return <p className={styles.empty}>目前沒有社內訊息。</p>;
  return <div className={styles.list}>
    {items.map((item) => <Link
      className={item.unread ? `${styles.item} ${styles.unread}` : styles.item}
      href={item.href}
      key={`${item.date}-${item.title}`}
      prefetch={false}
    >
      <small>{item.date}{item.unread && <span className="sr-only">（未讀）</span>}</small>
      <strong>{item.title}</strong>
      <span>{item.summary}</span>
    </Link>)}
  </div>;
}

export function NotificationBellLoading() {
  return <p aria-busy="true" className={styles.empty}>正在載入社內訊息…</p>;
}

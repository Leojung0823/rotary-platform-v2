"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import { ShellIcon } from "@/components/shell-icons";
import {
  resolveCurrentNavigationItemId,
  type ShellNavigationItem,
} from "@/lib/role-shells";
import styles from "./role-aware-app-shell.module.css";

function NavigationBadge({ count }: { count?: number }) {
  if (!count) return null;
  return <span className={styles.navigationBadge}>
    <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
    <span className="sr-only">{count} 則未讀訊息</span>
  </span>;
}

export function RoleAwareShellNavigation({
  items,
  initialPathname,
}: {
  items: readonly ShellNavigationItem[];
  initialPathname: string;
}) {
  // The authenticated layout is shared across sibling routes, so its server
  // pathname can remain the previous page during a soft navigation. Reading
  // the live pathname here keeps the selected tab and its icon in sync with
  // what the member just opened.
  const pathname = usePathname() ?? initialPathname;
  const currentItemId = resolveCurrentNavigationItemId(items, pathname);

  return <nav className={styles.navigation} aria-label="主要導覽">
    <ul style={{ "--nav-count": items.length } as CSSProperties}>
      {items.map((item) => <li key={item.id}>
        {item.forceReload
          ? <a
              href={item.href}
              data-navigation-id={item.id}
              aria-current={item.id === currentItemId ? "page" : undefined}
            >
              <span className={styles.navigationIcon}><ShellIcon name={item.icon} /></span>
              <span className={styles.desktopLabel}>{item.label}</span>
              <span className={styles.mobileLabel}>{item.mobileLabel}</span>
              <NavigationBadge count={item.badgeCount} />
            </a>
          : <Link
              href={item.href}
              prefetch={false}
              data-navigation-id={item.id}
              aria-current={item.id === currentItemId ? "page" : undefined}
            >
              <span className={styles.navigationIcon}><ShellIcon name={item.icon} /></span>
              <span className={styles.desktopLabel}>{item.label}</span>
              <span className={styles.mobileLabel}>{item.mobileLabel}</span>
              <NavigationBadge count={item.badgeCount} />
            </Link>}
      </li>)}
    </ul>
  </nav>;
}

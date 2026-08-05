"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Identity } from "@/lib/auth";
import styles from "./app-shell.module.css";

type MemberIconName = "home" | "events" | "members" | "me";

const memberItems: Array<{ href: string; label: string; icon: MemberIconName }> = [
  { href: "/dashboard", label: "首頁", icon: "home" },
  { href: "/events", label: "活動", icon: "events" },
  { href: "/directory", label: "社員", icon: "members" },
  { href: "/me", label: "我的", icon: "me" },
];

function MemberIcon({ name }: { name: MemberIconName }) {
  if (name === "home") return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" /></svg>;
  if (name === "events") return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 3v3m12-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Zm3 8h3v3H8Z" /></svg>;
  if (name === "members") return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-1a3 3 0 1 0 0-6M2 21v-3a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v3Zm14-8a5 5 0 0 1 6 5v3h-5" /></svg>;
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM4 21a8 8 0 0 1 16 0Z" /></svg>;
}

function isCurrent(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href || pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function MemberNavigation({ pathname, mobile = false }: { pathname: string; mobile?: boolean }) {
  return <nav className={mobile ? "mobile-nav" : "member-nav"} aria-label={mobile ? "行動版主要導覽" : "主要導覽"}>
    {memberItems.map((item) => {
      const current = isCurrent(pathname, item.href);
      return <Link key={item.href} href={item.href} aria-current={current ? "page" : undefined}>
        <MemberIcon name={item.icon} />
        <span>{item.label}</span>
      </Link>;
    })}
  </nav>;
}

function ClubManagementNavigation({ clubId, pathname }: { clubId: string; pathname: string }) {
  const items = [
    ["管理首頁", `/clubs/${clubId}/identity`],
    ["活動管理", `/clubs/${clubId}/events`],
    ["報名與簽到", `/clubs/${clubId}/attendance`],
    ["社員管理", `/clubs/${clubId}/members`],
    ["邀請管理", `/clubs/${clubId}/invitations`],
    ["公告管理", `/clubs/${clubId}/announcements`],
    ["LINE 與通知設定", `/clubs/${clubId}/line-oa`],
    ["操作紀錄", `/clubs/${clubId}/audit`],
  ];
  return <nav className="management-nav" aria-label="社務管理導覽">
    {items.map(([label, href]) => <Link key={href} href={href} aria-current={isCurrent(pathname, href) ? "page" : undefined}>{label}</Link>)}
  </nav>;
}

function PlatformNavigation({ pathname }: { pathname: string }) {
  return <nav className="management-nav" aria-label="平台管理導覽">
    <Link href="/platform/clubs" aria-current={isCurrent(pathname, "/platform/clubs") ? "page" : undefined}>扶輪社管理</Link>
  </nav>;
}

export function AppShell({ identity, children }: { identity: Identity; children: React.ReactNode }) {
  const pathname = usePathname();
  const clubMatch = pathname.match(/^\/clubs\/([0-9a-f-]+)/iu);
  const isPlatformMode = pathname.startsWith("/platform/");
  const isManagementMode = Boolean(clubMatch) || isPlatformMode;

  return <div className={`shell ${isManagementMode ? "management-shell" : "member-shell"}`}>
    <aside className="sidebar">
      <Link href={isManagementMode ? (isPlatformMode ? "/platform/clubs" : `/clubs/${clubMatch?.[1]}/identity`) : "/dashboard"} className="brand">
        <span className="brand-mark">R</span>
        <span>{isPlatformMode ? "平台管理後台" : isManagementMode ? "社務管理" : "扶輪社員平台"}</span>
      </Link>
      {clubMatch ? <ClubManagementNavigation clubId={clubMatch[1]} pathname={pathname} />
        : isPlatformMode ? <PlatformNavigation pathname={pathname} />
          : <MemberNavigation pathname={pathname} />}
      <div className={styles.footer}>
        <div className="account"><div className="avatar">{identity.display_name.slice(0, 1)}</div><div><strong>{identity.display_name}</strong><small>{identity.email}</small></div></div>
        {!isManagementMode && <form action="/api/auth/line/logout?redirect=1" method="post"><button className="link-button">登出</button></form>}
      </div>
    </aside>
    <div className="shell-body">
      {isManagementMode && <div className="management-mode-banner" role="status">
        <strong>{isPlatformMode ? "目前為平台管理模式" : "目前為管理模式"}</strong>
        <Link href="/dashboard">返回社員首頁</Link>
      </div>}
      {clubMatch ? <details className="management-mobile-menu">
        <summary>社務管理選單</summary>
        <ClubManagementNavigation clubId={clubMatch[1]} pathname={pathname} />
      </details> : isPlatformMode ? <details className="management-mobile-menu">
        <summary>平台管理選單</summary>
        <PlatformNavigation pathname={pathname} />
      </details> : null}
      <main id="main" className="content">{children}</main>
    </div>
    {!isManagementMode && <MemberNavigation pathname={pathname} mobile />}
  </div>;
}

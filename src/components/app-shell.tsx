import Link from "next/link";
import type { Identity } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import styles from "./app-shell.module.css";

type ManageableClub = { club_id: string; club_name: string; permission_level: string };

function environmentLabel() {
  if (process.env.APP_ENV === "production") return "ONLINE";
  if (process.env.APP_ENV === "staging") return "STAGING";
  return "LOCAL";
}

export async function LegacyAppShell({
  identity,
  children,
  fallbackNotice,
}: {
  identity: Identity;
  children: React.ReactNode;
  fallbackNotice?: string;
}) {
  const isPlatform = identity.platform_roles.includes("superadmin") || identity.platform_roles.includes("platform_admin");

  // Platform admins already reach every club via 平台管理; only club operators
  // and role-assigned managers need a direct entry point here, since the
  // legacy shell has no other way to discover /clubs/[clubId] management.
  let manageableClubs: ManageableClub[] = [];
  if (!isPlatform) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("list_manageable_clubs");
    manageableClubs = ((data ?? []) as ManageableClub[]).filter((club) => club.permission_level !== "member");
  }
  const firstManageableClubId = manageableClubs[0]?.club_id;

  return <div className="shell">
    <aside className="sidebar">
      <Link href="/dashboard" className="brand"><span className="brand-mark">R</span><span>扶輪管理平台<small>ROTARY V2 · {environmentLabel()}</small></span></Link>
      <nav aria-label="主要導覽">
        <Link href="/dashboard">總覽</Link>
        <Link href="/features">功能總覽</Link>
        <Link href="/directory">社員名冊</Link>
        <Link href="/events">活動</Link>
        <Link href="/board">留言板</Link>
        <Link href="/me">會員中心</Link>
        {manageableClubs.length === 1 && <Link href={`/clubs/${manageableClubs[0].club_id}/members`}>社團管理</Link>}
        {manageableClubs.length > 1 && manageableClubs.map((club) => (
          <Link key={club.club_id} href={`/clubs/${club.club_id}/members`}>社團管理・{club.club_name}</Link>
        ))}
        {isPlatform && <Link href="/platform/clubs">平台管理</Link>}
      </nav>
      <div className={styles.footer}>
        <div className="account"><div className="avatar">{identity.display_name.slice(0, 1)}</div><div><strong>{identity.display_name}</strong><small>{identity.email}</small></div></div>
        <form action="/api/auth/line/logout?redirect=1" method="post"><button className="link-button">登出</button></form>
      </div>
    </aside>
    <main id="main" tabIndex={-1} className="content">{fallbackNotice && <Notice tone="error">{fallbackNotice}</Notice>}{children}</main>
    <nav className="mobile-nav" aria-label="行動版導覽">
      <Link href="/dashboard">總覽</Link>
      <Link href="/features">功能</Link>
      <Link href="/directory">名冊</Link>
      <Link href="/events">活動</Link>
      <Link href="/board">留言板</Link>
      <Link href="/me">我的</Link>
      {firstManageableClubId && <Link href={`/clubs/${firstManageableClubId}/members`}>社團</Link>}
      {isPlatform && <Link href="/platform/clubs">平台</Link>}
      <form className={styles.mobileLogout} action="/api/auth/line/logout?redirect=1" method="post">
        <button type="submit">登出</button>
      </form>
    </nav>
  </div>;
}

// Kept as an alias for existing consumers while role-aware shells remain fully
// rollback-safe behind role_shells_v2.
export const AppShell = LegacyAppShell;

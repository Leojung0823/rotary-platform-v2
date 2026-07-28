import Link from "next/link";
import { logoutAction } from "@/app/actions";
import type { Identity } from "@/lib/auth";

export function AppShell({ identity, children }: { identity: Identity; children: React.ReactNode }) {
  const isPlatform = identity.platform_roles.includes("superadmin") || identity.platform_roles.includes("platform_admin");
  return <div className="shell">
    <aside className="sidebar">
      <Link href="/dashboard" className="brand"><span className="brand-mark">R</span><span>扶輪管理平台<small>ROTARY V2 · LOCAL</small></span></Link>
      <nav aria-label="主要導覽">
        <Link href="/dashboard">總覽</Link>
        {isPlatform && <Link href="/platform/clubs">平台管理</Link>}
      </nav>
      <div className="account"><div className="avatar">{identity.display_name.slice(0, 1)}</div><div><strong>{identity.display_name}</strong><small>{identity.email}</small></div></div>
      <form action={logoutAction}><button className="link-button">登出</button></form>
    </aside>
    <main id="main" className="content">{children}</main>
    <nav className="mobile-nav" aria-label="行動版導覽"><Link href="/dashboard">總覽</Link>{isPlatform && <Link href="/platform/clubs">平台</Link>}</nav>
  </div>;
}

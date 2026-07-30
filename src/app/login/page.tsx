import Link from "next/link";
import { redirect } from "next/navigation";
import { loginWithPasswordAction } from "@/app/auth-actions";
import { Button, Field, Input, Notice } from "@/components/ui";
import { getAuthenticatedUser } from "@/lib/auth";
import { safeMessage, safeRedirectPath } from "@/lib/validation";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; returnTo?: string }>;
}) {
  const query = await searchParams;
  const returnTo = safeRedirectPath(query.returnTo, "/dashboard");
  if (await getAuthenticatedUser()) redirect(returnTo);

  const message = safeMessage(query.error);
  const local = process.env.APP_ENV !== "staging" && process.env.APP_ENV !== "production";

  return <main className="auth-page">
    <section className="auth-panel">
      <div className="brand"><span className="brand-mark">R</span><span>扶輪管理平台<small>ROTARY PLATFORM V2</small></span></div>
      <div className="auth-copy"><p className="eyebrow">安全的多社管理</p><h1>歡迎回來</h1><p>請使用您的個人帳號登入。每一項平台與社務操作都會留下可稽核紀錄。</p></div>

      {message && <Notice tone="error">{message}</Notice>}
      {query.success === "password_updated" && <Notice tone="success">密碼已更新，請使用新密碼登入。</Notice>}

      <a className="button line-button" href={`/api/auth/line/start?returnTo=${encodeURIComponent(returnTo)}`}>使用 LINE 登入</a>
      <div className="divider"><span>或使用平台密碼</span></div>

      <form action={loginWithPasswordAction} className="form-stack">
        <input type="hidden" name="returnTo" value={returnTo} />
        <Field label="電子郵件"><Input name="email" type="email" autoComplete="email" required placeholder="name@example.com" /></Field>
        <Field label="密碼"><Input name="password" type="password" autoComplete="current-password" required minLength={12} /></Field>
        <Button type="submit">登入平台</Button>
      </form>

      <div className="form-actions">
        <Link className="back-link" href="/forgot-password">忘記密碼？</Link>
        <Link className="back-link" href="/status">系統狀態</Link>
      </div>
      <p className="auth-footnote">
        {local ? "本機邀請信與密碼重設信可在 Mailpit 檢視。" : "無法登入時，請聯絡所屬扶輪社的社務管理員。"}
      </p>
    </section>
    <aside className="auth-art" aria-hidden="true"><div className="orb orb-one"/><div className="orb orb-two"/><blockquote>以清楚的身份、最小權限與跨社隔離，支援每一位獨立作業的執行秘書。</blockquote></aside>
  </main>;
}

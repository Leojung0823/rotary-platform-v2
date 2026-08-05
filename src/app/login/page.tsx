import Link from "next/link";
import { loginWithPasswordAction } from "@/app/auth-actions";
import { LoginSessionRedirect } from "@/components/login-session-redirect";
import { Button, Field, Input, Notice } from "@/components/ui";
import { safeMessage, safeRedirectPath } from "@/lib/validation";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; returnTo?: string }>;
}) {
  const query = await searchParams;
  const returnTo = safeRedirectPath(query.returnTo, "/dashboard");
  const message = safeMessage(query.error);

  return <main id="main" className="auth-page auth-page-simple">
    <LoginSessionRedirect returnTo={returnTo} />
    <section className="auth-panel auth-panel-simple">
      <div className="brand auth-brand"><span className="brand-mark">R</span><span>扶輪社員平台</span></div>
      <div className="auth-copy"><h1>歡迎回來</h1><p>登入後即可查看活動、完成報名與聯絡社友。</p></div>
      {message && <Notice tone="error">{message}</Notice>}
      {query.success === "password_updated" && <Notice tone="success">密碼已更新，請使用新密碼登入。</Notice>}
      {query.success === "line_unbound" && <Notice tone="success">LINE 登入已解除綁定，請使用電子郵件登入。</Notice>}
      <a className="button line-button button-full auth-primary" href={`/api/auth/line/start?returnTo=${encodeURIComponent(returnTo)}`}>使用 LINE 登入</a>
      <details className="email-login-details">
        <summary>使用電子郵件登入</summary>
        <form action={loginWithPasswordAction} className="form-stack">
          <input type="hidden" name="returnTo" value={returnTo} />
          <Field label="電子郵件"><Input name="email" type="email" autoComplete="email" required /></Field>
          <Field label="密碼"><Input name="password" type="password" autoComplete="current-password" required minLength={12} /></Field>
          <Button className="button-full" type="submit">登入</Button>
        </form>
      </details>
      <Link className="text-action auth-help" href="/login-help">登入遇到問題？</Link>
    </section>
  </main>;
}

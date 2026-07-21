import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions";
import { getAuthenticatedUser } from "@/lib/auth";
import { safeMessage } from "@/lib/validation";
import { Button, Field, Input, Notice } from "@/components/ui";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getAuthenticatedUser()) redirect("/dashboard");
  const { error } = await searchParams;
  const message = safeMessage(error);
  return <main className="auth-page">
    <section className="auth-panel">
      <div className="brand"><span className="brand-mark">R</span><span>扶輪管理平台<small>ROTARY PLATFORM V2</small></span></div>
      <div className="auth-copy"><p className="eyebrow">安全的多社管理</p><h1>歡迎回來</h1><p>請使用您的個人帳號登入。每一項平台與社務操作都會留下可稽核紀錄。</p></div>
      {message && <Notice tone="error">{message}</Notice>}
      <form action={loginAction} className="form-stack">
        <Field label="電子郵件"><Input name="email" type="email" autoComplete="email" required placeholder="name@example.com" /></Field>
        <Field label="密碼"><Input name="password" type="password" autoComplete="current-password" required minLength={8} /></Field>
        <Button type="submit">登入平台</Button>
      </form>
      <p className="auth-footnote">本開發版本僅連接本機 Supabase；邀請信可在 Mailpit 檢視。</p>
    </section>
    <aside className="auth-art" aria-hidden="true"><div className="orb orb-one"/><div className="orb orb-two"/><blockquote>以清楚的身份、最小權限與跨社隔離，支援每一位獨立作業的執行秘書。</blockquote></aside>
  </main>;
}

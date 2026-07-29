import Link from "next/link";
import { requestPasswordResetAction } from "@/app/auth-actions";
import { Button, Card, Field, Input, Notice } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const query = await searchParams;

  return <main className="center-page">
    <Card className="accept-card">
      <p className="eyebrow">帳號安全</p>
      <h1>忘記密碼</h1>
      <p>輸入平台登入 Email。若帳號可使用，系統會寄出一次性的密碼重設連結。</p>

      {query.success === "sent" && <Notice tone="success">
        若這個 Email 有可使用的帳號，重設信已寄出。請查看信箱；本機開發可至 Mailpit 檢視。
      </Notice>}

      <form action={requestPasswordResetAction} className="form-stack">
        <Field label="電子郵件">
          <Input name="email" type="email" autoComplete="email" required placeholder="name@example.com" />
        </Field>
        <Button type="submit">寄送重設連結</Button>
      </form>

      <Link className="back-link" href="/login">← 返回登入</Link>
    </Card>
  </main>;
}

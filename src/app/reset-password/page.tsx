import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { resetPasswordAction } from "@/app/auth-actions";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { getAuthenticatedUser } from "@/lib/auth";
import { safeMessage } from "@/lib/validation";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const store = await cookies();
  const recoveryMarker = store.get("rotary_recovery")?.value ?? "";
  const user = await getAuthenticatedUser();
  if (!user || !/^[0-9a-f]{48}$/i.test(recoveryMarker)) redirect("/login?error=recovery_invalid");

  const query = await searchParams;
  const message = safeMessage(query.error);

  return <main className="center-page">
    <Card className="accept-card">
      <p className="eyebrow">帳號安全</p>
      <h1>設定新密碼</h1>
      <p>請設定至少 12 個字元的新密碼。完成後所有既有登入工作階段會登出。</p>

      {message && <Notice tone="error">{message}</Notice>}

      <form action={resetPasswordAction} className="form-stack">
        <Field label="新密碼">
          <Input name="password" type="password" autoComplete="new-password" minLength={12} required />
        </Field>
        <Field label="再次輸入新密碼">
          <Input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={12} required />
        </Field>
        <Button type="submit">更新密碼並登出</Button>
      </form>

      <Link className="back-link" href="/login">← 返回登入</Link>
    </Card>
  </main>;
}

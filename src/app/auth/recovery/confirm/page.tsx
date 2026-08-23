import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { confirmPasswordRecoveryAction } from "@/app/auth-actions";
import { Button, Card, Notice } from "@/components/ui";
import { trustedSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "確認重設密碼",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ConfirmPasswordRecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; token_hash?: string; type?: string; next?: string }>;
}) {
  const query = await searchParams;
  const code = query.code?.trim() ?? "";
  const tokenHash = query.token_hash?.trim() ?? "";
  const validCode = code.length > 0 && code.length <= 2048;
  const validToken = tokenHash.length > 0
    && tokenHash.length <= 2048
    && query.type === "recovery";

  if (query.next !== "/reset-password" || (!validCode && !validToken)) {
    const target = new URL("/login", trustedSiteUrl());
    target.searchParams.set("error", "recovery_invalid");
    redirect(target.toString());
  }

  return <main className="center-page">
    <Card className="accept-card">
      <p className="eyebrow">帳號安全</p>
      <h1>確認重設密碼</h1>
      <Notice>為避免信箱的安全掃描器誤用一次性連結，請由您本人按下按鈕後再驗證。</Notice>
      <p>確認後會進入設定新密碼頁；這個動作不會顯示或寄出您的帳號資料。</p>
      <form action={confirmPasswordRecoveryAction} className="form-stack">
        {validCode && <input type="hidden" name="code" value={code} />}
        {validToken && <>
          <input type="hidden" name="tokenHash" value={tokenHash} />
          <input type="hidden" name="type" value="recovery" />
        </>}
        <Button type="submit">確認是我本人，繼續重設</Button>
      </form>
    </Card>
  </main>;
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClubAction } from "@/app/actions";
import { hasPlatformAccess, requireIdentity } from "@/lib/auth";
import { safeMessage } from "@/lib/validation";
import { Button, Card, Field, Input, Notice } from "@/components/ui";

export default async function NewClubPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const identity = await requireIdentity();
  if (!hasPlatformAccess(identity)) redirect("/access-denied");
  const message = safeMessage((await searchParams).error);
  return <div className="narrow page-stack"><header><Link href="/platform/clubs" className="back-link">← 返回扶輪社列表</Link><p className="eyebrow">新增租戶</p><h1>建立扶輪社</h1><p>建立後會先進入建置中狀態；第一位執行秘書帳號建立後自動啟用。</p></header>{message && <Notice tone="error">{message}</Notice>}<Card><form action={createClubAction} className="form-stack"><div className="form-grid"><Field label="扶輪社代碼" hint="2–32 個英數字，可使用 - 或 _"><Input name="clubCode" required placeholder="TAIPEI-NORTH" /></Field><Field label="扶輪社名稱"><Input name="clubName" required placeholder="台北北區扶輪社" /></Field></div><hr/><div><h2>第一位執行秘書</h2><p className="subtle">直接設定帳號密碼，不寄送邀請信；請自行將帳密告知執行秘書。</p></div><div className="form-grid"><Field label="姓名"><Input name="operatorName" required autoComplete="name" /></Field><Field label="電子郵件"><Input name="operatorEmail" required type="email" autoComplete="email" /></Field><Field label="密碼" hint="至少 12 個字元"><Input name="operatorPassword" required type="password" minLength={12} autoComplete="new-password" /></Field><Field label="確認密碼"><Input name="operatorPasswordConfirmation" required type="password" minLength={12} autoComplete="new-password" /></Field></div><div className="form-actions"><Link href="/platform/clubs" className="button button-secondary">取消</Link><Button type="submit">建立並設定帳號</Button></div></form></Card></div>;
}

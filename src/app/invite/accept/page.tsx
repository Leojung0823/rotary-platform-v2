import { redirect } from "next/navigation";
import { acceptInvitationAction, logoutAction } from "@/app/actions";
import { getAuthenticatedUser } from "@/lib/auth";
import { safeMessage } from "@/lib/validation";
import { Button, Card, Field, Input, Notice } from "@/components/ui";

export default async function AcceptInvitationPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  const message = safeMessage((await searchParams).error);
  return <main className="center-page"><Card className="accept-card"><div className="brand-mark large">R</div><p className="eyebrow">執行秘書邀請</p><h1>接受扶輪社管理邀請</h1><p>您目前以 <strong>{user.email}</strong> 登入。系統只會接受寄到同一信箱且仍有效的邀請。</p>{message && <Notice tone="error">{message}</Notice>}<ul className="check-list"><li>建立或比對您的個人身份與平台帳號</li><li>授予特定扶輪社的執行秘書權限</li><li>保留完整邀請與接受稽核紀錄</li></ul><form action={acceptInvitationAction} className="form-stack accept-form"><Field label="設定登入密碼"><Input name="password" type="password" autoComplete="new-password" minLength={12} required /></Field><Field label="再次輸入密碼"><Input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={12} required /></Field><Button type="submit">設定密碼並接受邀請</Button></form><form action={logoutAction}><button className="link-button" type="submit">這不是我的信箱，改用其他帳號</button></form></Card></main>;
}

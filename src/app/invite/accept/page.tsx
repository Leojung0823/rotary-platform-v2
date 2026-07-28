import { redirect } from "next/navigation";
import { acceptInvitationAction, logoutAction } from "@/app/actions";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { getAuthenticatedUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { safeMessage } from "@/lib/validation";

export const dynamic = "force-dynamic";

type InvitationChoice = {
  invite_id: string;
  club_id: string;
  club_code: string;
  club_name: string;
  display_name: string;
  expires_at: string;
};

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const query = await searchParams;
  const message = safeMessage(query.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_current_operator_invitations");
  const invitations = (data ?? []) as InvitationChoice[];

  return (
    <main className="center-page">
      <Card className="accept-card">
        <div className="brand-mark large">R</div>
        <p className="eyebrow">執行秘書邀請</p>
        <h1>接受扶輪社管理邀請</h1>
        <p>
          您目前以 <strong>{user.email}</strong> 登入。系統只會顯示寄到同一個已驗證信箱、且仍在有效期限內的邀請。
        </p>

        {message && <Notice tone="error">{message}</Notice>}
        {error && <Notice tone="error">目前無法讀取邀請，請重新登入後再試。</Notice>}

        {!error && invitations.length === 0 ? (
          <Notice tone="error">目前找不到可接受的邀請。邀請可能已過期、已接受，或不是寄到這個信箱。</Notice>
        ) : (
          !error && (
            <form action={acceptInvitationAction} className="form-stack accept-form">
              {invitations.length === 1 ? (
                <>
                  <input type="hidden" name="inviteId" value={invitations[0].invite_id} />
                  <div className="notice notice-neutral">
                    <strong>{invitations[0].club_name}</strong>
                    <div>
                      {invitations[0].club_code} · 到期時間：
                      {new Intl.DateTimeFormat("zh-TW", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(invitations[0].expires_at))}
                    </div>
                  </div>
                </>
              ) : (
                <fieldset className="form-stack">
                  <legend>請選擇要接受的扶輪社邀請</legend>
                  {invitations.map((invitation) => (
                    <label className="notice notice-neutral" key={invitation.invite_id}>
                      <input
                        type="radio"
                        name="inviteId"
                        value={invitation.invite_id}
                        required
                      />{" "}
                      <strong>{invitation.club_name}</strong>
                      <span className="subtle">
                        {invitation.club_code} · 到期時間：
                        {new Intl.DateTimeFormat("zh-TW", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(invitation.expires_at))}
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}

              <ul className="check-list">
                <li>建立或比對您的個人身份與平台帳號</li>
                <li>只授予您明確選擇的扶輪社執行秘書權限</li>
                <li>保留完整邀請與接受稽核紀錄</li>
              </ul>

              <Field label="設定登入密碼">
                <Input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
              </Field>
              <Field label="再次輸入密碼">
                <Input
                  name="passwordConfirmation"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
              </Field>
              <Button type="submit">設定密碼並接受所選邀請</Button>
            </form>
          )
        )}

        <form action={logoutAction}>
          <button className="link-button" type="submit">
            這不是我的信箱，改用其他帳號
          </button>
        </form>
      </Card>
    </main>
  );
}

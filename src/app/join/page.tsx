import type { Metadata } from "next";
import Link from "next/link";
import { completeMemberJoinAction } from "@/app/actions";
import { signOutToLoginAction, startPasswordMemberJoinAction } from "@/app/auth-actions";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { getAuthenticatedUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { safeMessage } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "接受扶輪社邀請", referrer: "no-referrer" };

type Preview = {
  club_name: string;
  status: string;
  invitation_kind: "member_join" | "line_rebind";
  name: string;
  has_email: boolean;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
};

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string; success?: string }>;
}) {
  const query = await searchParams;
  const token = query.token ?? "";
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_member_invitation_preview", { p_token: token });
  const preview = data as Preview | null;

  if (!preview || !["pending", "sent"].includes(preview.status)) {
    return <main className="center-page"><Card className="accept-card">
      <h1>邀請無法使用</h1>
      <p>邀請不存在、已取消、已接受或已過期。請聯絡扶輪社秘書重新發送。</p>
      <Link className="button button-secondary" href="/login">前往登入</Link>
    </Card></main>;
  }

  const user = await getAuthenticatedUser();
  const message = safeMessage(query.error);
  const returnTo = `/join?token=${encodeURIComponent(token)}`;

  if (!user) {
    const canCreatePasswordAccount = preview.invitation_kind === "member_join" && preview.has_email;

    return <main className="center-page"><Card className="accept-card">
      <p className="eyebrow">{preview.club_name}</p>
      <h1>{preview.name}，請確認您的身份</h1>
      <p>選擇 LINE Login，或使用秘書預建的 Email 建立平台密碼。已有帳號者請直接登入。</p>

      {message && <Notice tone="error">{message}</Notice>}

      <a className="button line-button" href={`/api/auth/line/start?invite=${encodeURIComponent(token)}&returnTo=/join`}>
        使用 LINE 一鍵確認身份
      </a>

      {canCreatePasswordAccount && <>
        <div className="divider"><span>或建立平台密碼</span></div>
        <form action={startPasswordMemberJoinAction} className="form-stack">
          <input type="hidden" name="token" value={token} />
          <Field label="秘書預建的 Email">
            <Input name="email" type="email" autoComplete="email" required placeholder="name@example.com" />
          </Field>
          <Field label="設定平台密碼">
            <Input name="password" type="password" autoComplete="new-password" minLength={12} required />
          </Field>
          <Field label="再次輸入密碼">
            <Input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={12} required />
          </Field>
          <Button type="submit">建立帳號並繼續確認</Button>
        </form>
      </>}

      {!canCreatePasswordAccount && preview.invitation_kind === "member_join" && <Notice>
        這份邀請沒有預建 Email，請使用 LINE 驗證，或請秘書補上 Email 後重新發送。
      </Notice>}

      <div className="form-actions">
        <Link className="button button-secondary" href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
          已有平台帳號，先登入
        </Link>
      </div>
      <p className="auth-footnote">LINE Login 與 LINE Official Account 推播是兩個獨立系統。</p>
    </Card></main>;
  }

  const viewerMatchesInvitation = Boolean(preview.email || preview.phone || preview.birth_date);
  if (!viewerMatchesInvitation) {
    return <main className="center-page"><Card className="accept-card">
      <p className="eyebrow">{preview.club_name}</p>
      <h1>目前登入帳號與邀請不相符</h1>
      <Notice tone="error">請切換成受邀社員的帳號，再重新確認這份邀請。</Notice>
      <form action={signOutToLoginAction}>
        <input type="hidden" name="returnTo" value={returnTo} />
        <Button type="submit">切換登入帳號</Button>
      </form>
    </Card></main>;
  }

  return <main className="center-page"><Card className="accept-card">
    <p className="eyebrow">{preview.club_name}</p>
    <h1>確認社員資料</h1>
    <p>以下資料由秘書建立。資料正確可直接確認；也可補齊缺少或修正錯誤的欄位。</p>

    {message && <Notice tone="error">{message}</Notice>}
    {query.success === "password_ready" && <Notice tone="success">平台帳號已建立，請完成最後的社員資料確認。</Notice>}

    <form action={completeMemberJoinAction} className="form-stack accept-form">
      <input type="hidden" name="token" value={token} />
      <Field label="姓名"><Input name="name" required defaultValue={preview.name} /></Field>
      <Field label="手機"><Input name="phone" defaultValue={preview.phone ?? ""} /></Field>
      <Field label="Email"><Input name="email" type="email" defaultValue={preview.email ?? ""} /></Field>
      <Field label="生日"><Input name="birthDate" type="date" defaultValue={preview.birth_date ?? ""} /></Field>
      <Button type="submit">確認加入扶輪社</Button>
    </form>
  </Card></main>;
}

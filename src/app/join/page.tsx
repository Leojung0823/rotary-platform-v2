import type { Metadata } from "next";
import { completeMemberJoinAction } from "@/app/actions";
import { getAuthenticatedUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { safeMessage } from "@/lib/validation";
import { Button, Card, Field, Input, Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "接受扶輪社邀請", referrer: "no-referrer" };
type Preview = { club_name: string; status: string; name: string; phone: string | null; email: string | null; birth_date: string | null };

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const query = await searchParams; const token = query.token ?? ""; const supabase = await createClient();
  const { data } = await supabase.rpc("get_member_invitation_preview", { p_token: token }); const preview = data as Preview | null;
  if (!preview || !["pending", "sent"].includes(preview.status)) return <main className="center-page"><Card className="accept-card"><h1>邀請無法使用</h1><p>邀請不存在、已取消、已接受或已過期。請聯絡扶輪社秘書重新發送。</p></Card></main>;
  const user = await getAuthenticatedUser(); const message = safeMessage(query.error);
  if (!user) return <main className="center-page"><Card className="accept-card"><div className="line-mark">LINE</div><p className="eyebrow">{preview.club_name}</p><h1>{preview.name}，請確認您的身份</h1><p>扶輪社已經準備好您的會員資料。使用 LINE Login 後只需要確認，不必重新填寫。</p><a className="button line-button" href={`/api/auth/line/start?invite=${encodeURIComponent(token)}&returnTo=/join`}>使用 LINE 一鍵確認身份</a><p className="auth-footnote">LINE Login 只用於身份驗證，與 LINE Official Account 推播完全獨立。</p></Card></main>;
  return <main className="center-page"><Card className="accept-card"><p className="eyebrow">{preview.club_name}</p><h1>確認社員資料</h1><p>以下資料由秘書建立。資料正確可直接確認；只需補齊缺少或修正錯誤的欄位。</p>{message && <Notice tone="error">{message}</Notice>}<form action={completeMemberJoinAction} className="form-stack accept-form"><input type="hidden" name="token" value={token}/><Field label="姓名"><Input name="name" required defaultValue={preview.name}/></Field><Field label="手機"><Input name="phone" defaultValue={preview.phone ?? ""}/></Field><Field label="Email"><Input name="email" type="email" defaultValue={preview.email ?? ""}/></Field><Field label="生日"><Input name="birthDate" type="date" defaultValue={preview.birth_date ?? ""}/></Field><Button type="submit">確認加入扶輪社</Button></form></Card></main>;
}

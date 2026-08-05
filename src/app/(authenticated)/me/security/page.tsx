import Link from "next/link";
import { revokeDeviceAction } from "@/app/actions";
import { unbindMyLineIdentityAction } from "@/app/identity-actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Button, Field, Input, Notice } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { safeMessage } from "@/lib/validation";

type Center = {
  account: { has_password_login: boolean };
  line_identity: { display_name: string; status: string } | null;
  devices: Array<{ id: string; name: string; last_seen_at: string; revoked_at: string | null; is_current: boolean }>;
  login_history: Array<{ provider: string; outcome: string; created_at: string }>;
};

const providers: Record<string, string> = { password: "電子郵件", line: "LINE", line_mock: "LINE", invite: "邀請連結" };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const [query, supabase] = await Promise.all([searchParams, createClient()]); const result = await supabase.rpc("get_my_identity_center"); const center = result.data as Center | null;
  if (!center) return <Notice tone="error">帳號安全資料暫時無法載入。</Notice>;
  return <div className="page-stack narrow"><Link className="back-link" href="/me">← 返回我的</Link><header><h1>帳號與登入安全</h1><p>管理登入方式與已登入的裝置。</p></header>{query.success === "device_revoked" && <Notice tone="success">指定裝置已登出。</Notice>}{query.error && <Notice tone="error">{safeMessage(query.error)}</Notice>}
    <section className="card"><h2>登入方式</h2>{center.line_identity ? <p>LINE 登入：已連結 {center.line_identity.display_name}</p> : <div className="form-stack"><p>尚未連結 LINE 登入。</p><a className="button" href="/api/auth/line/start?flow=bind&returnTo=%2Fme%2Fsecurity">連結 LINE 登入</a></div>}<p>電子郵件密碼：{center.account.has_password_login ? "可使用" : "尚未設定"}</p><Link className="text-action" href="/forgot-password">重新設定密碼</Link></section>
    <section><div className="section-heading"><h2>已登入的裝置</h2></div><div className="management-card-list">{center.devices.filter((device) => !device.revoked_at).map((device) => <article className="card device-card" key={device.id}><div><h3>{device.name}</h3><p>{device.is_current ? "目前使用中的裝置" : `最近使用：${new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short" }).format(new Date(device.last_seen_at))}`}</p></div><form action={revokeDeviceAction}><input type="hidden" name="deviceId" value={device.id} /><Button className="button-secondary" type="submit">{device.is_current ? "登出目前裝置" : "登出此裝置"}</Button></form></article>)}</div></section>
    <section><div className="section-heading"><h2>最近登入</h2></div><div className="compact-list">{center.login_history.slice(0, 10).map((item, index) => <div className="attempt-row" key={`${item.created_at}-${index}`}><span><strong>{providers[item.provider] ?? "其他方式"}</strong><small>{new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</small></span><span>{item.outcome === "success" ? "成功" : "未完成"}</span></div>)}</div></section>
    {center.line_identity && <section className="danger-zone"><h2>帳號管理</h2><p>解除 LINE 後，所有裝置都會登出。請確認您仍能使用電子郵件密碼登入。</p>{center.account.has_password_login ? <details className="danger-details"><summary>解除 LINE 登入</summary><form action={unbindMyLineIdentityAction} className="form-stack"><Field label="確認電子郵件密碼"><Input name="password" type="password" required autoComplete="current-password" /></Field><input type="hidden" name="reason" value="本人於帳號與登入安全解除 LINE 登入" /><ConfirmSubmitButton className="button button-danger" type="submit" confirmMessage="確定要解除 LINE 登入嗎？所有已登入的裝置都會立即登出。">確認解除 LINE 登入</ConfirmSubmitButton></form></details> : <Notice>目前只有 LINE 登入方式，請先設定可用的電子郵件密碼，或聯絡扶輪社秘書協助。</Notice>}</section>}
  </div>;
}

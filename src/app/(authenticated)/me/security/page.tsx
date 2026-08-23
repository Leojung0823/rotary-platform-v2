import { revokeDeviceAction } from "@/app/actions";
import { unbindMyLineIdentityAction } from "@/app/identity-actions";
import { Badge, Button, Card, Field, Input, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { identityProviderLabels, type IdentityCenter } from "@/lib/identity-center";
import { createClient } from "@/lib/supabase/server";
import { safeMessage } from "@/lib/validation";
import Link from "next/link";

const successMessages: Record<string, string> = {
  device_revoked: "裝置已登出。",
  line_bound: "LINE Login 已綁定，可使用 LINE 登入平台。",
  line_rebound: "LINE Login 已重新綁定，舊的 LINE 身份與登入工作階段不再有效。",
};

export default async function AccountSecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [query] = await Promise.all([searchParams, requireIdentity()]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_identity_center");

  if (error || !data) return <Notice tone="error">無法載入帳號安全資料。</Notice>;

  const center = data as IdentityCenter;

  return <div className="page-stack">
    <header className="page-header">
      <div>
        <p className="eyebrow">會員中心 · 帳號安全</p>
        <h1>登入方式與裝置</h1>
        <p>管理 LINE Login、平台密碼與已登入的裝置，並查看最近登入紀錄。</p>
      </div>
      <Link className="button button-secondary" href="/me">返回我的資料</Link>
    </header>

    {query.success && successMessages[query.success] && <Notice tone="success">{successMessages[query.success]}</Notice>}
    {query.error && <Notice tone="error">{safeMessage(query.error)}</Notice>}

    <div className="metric-grid">
      <Card><span className="metric-label">帳號狀態</span><strong className="metric-value metric-text">{center.account.status === "active" && center.account.has_active_access ? "可使用" : "受限制"}</strong></Card>
      <Card><span className="metric-label">平台密碼</span><strong className="metric-value metric-text">{center.account.has_password_login ? "可使用" : "未設定"}</strong></Card>
      <Card><span className="metric-label">LINE Login</span><strong className="metric-value metric-text">{center.line_identity?.status === "active" ? "已綁定" : "未綁定"}</strong></Card>
    </div>

    <div className="two-column">
      <Card>
        <h2>LINE Login</h2>
        {center.line_identity ? <div className="form-stack">
          <div className="status-pair"><Badge tone="success">已綁定</Badge><Badge tone="neutral">身份驗證</Badge></div>
          <p><strong>{center.line_identity.display_name}</strong></p>
          <p className="subtle">綁定：{new Intl.DateTimeFormat("zh-TW").format(new Date(center.line_identity.bound_at))}</p>
          {center.account.has_password_login ? <>
            <Notice tone="error">解除後會立即撤銷所有登入工作階段與裝置。下次只能使用平台密碼登入，或請秘書建立重新綁定邀請。</Notice>
            <form action={unbindMyLineIdentityAction} className="form-stack">
              <Field label="確認平台密碼"><Input name="password" type="password" required autoComplete="current-password" /></Field>
              <Field label="解除原因"><Input name="reason" required maxLength={500} defaultValue="本人於帳號安全頁面解除 LINE Login" /></Field>
              <Button type="submit" className="button-danger">確認解除 LINE Login</Button>
            </form>
          </> : <Notice>此帳號目前只有 LINE 登入方式，不能自行解除。請由秘書在社員管理中解除並產生重新綁定邀請。</Notice>}
        </div> : <div className="form-stack">
          <p>尚未綁定 LINE Login。綁定後可以用同一個 LINE 身份快速登入，不會建立第二個社員帳號。</p>
          <a className="button" href="/api/auth/line/start?flow=bind&returnTo=%2Fme%2Fsecurity">綁定 LINE Login</a>
        </div>}
      </Card>

      <Card>
        <h2>平台密碼與登入協助</h2>
        <p>{center.account.has_password_login ? "此帳號可使用平台密碼登入。" : "此帳號目前沒有平台密碼登入方式。"}</p>
        <p>忘記密碼時，系統會寄出一次性連結；必須由本人再次確認後才會進入重設流程。</p>
        <Link className="button button-secondary" href="/forgot-password">忘記密碼／重新設定</Link>
      </Card>
    </div>

    <section>
      <div className="section-heading"><h2>登入裝置</h2></div>
      <div className="table-wrap"><table>
        <thead><tr><th>裝置</th><th>最近使用</th><th>狀態</th><th>操作</th></tr></thead>
        <tbody>{center.devices.map((device) => <tr key={device.id}>
          <td><strong>{device.name}</strong>{device.is_current && <div><Badge tone="neutral">目前裝置</Badge></div>}</td>
          <td>{new Intl.DateTimeFormat("zh-TW", { dateStyle: "short", timeStyle: "short" }).format(new Date(device.last_seen_at))}</td>
          <td><Badge tone={device.revoked_at ? "danger" : "success"}>{device.revoked_at ? "已撤銷" : "有效"}</Badge></td>
          <td>{!device.revoked_at && <form action={revokeDeviceAction}><input type="hidden" name="deviceId" value={device.id} /><Button type="submit" className="button-secondary">{device.is_current ? "登出目前裝置" : "登出此裝置"}</Button></form>}</td>
        </tr>)}</tbody>
      </table></div>
    </section>

    <section>
      <div className="section-heading"><h2>最近登入</h2></div>
      <div className="table-wrap"><table>
        <thead><tr><th>時間</th><th>方式</th><th>結果</th></tr></thead>
        <tbody>{center.login_history.map((history, index) => <tr key={`${history.created_at}-${index}`}>
          <td>{new Intl.DateTimeFormat("zh-TW", { dateStyle: "short", timeStyle: "medium" }).format(new Date(history.created_at))}</td>
          <td>{identityProviderLabels[history.provider] ?? history.provider}</td>
          <td><Badge tone={history.outcome === "success" ? "success" : "danger"}>{history.outcome === "success" ? "成功" : history.outcome === "blocked" ? "已阻擋" : "失敗"}</Badge></td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </div>;
}

import { revokeDeviceAction, updateIdentitySettingsAction } from "@/app/actions";
import { updateMyProfileAction } from "@/app/profile-actions";
import { Badge, Button, Card, Field, Input, Notice } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

type Center = {
  profile: {
    display_name: string;
    phone: string | null;
    email: string | null;
    birth_date: string | null;
    avatar_url: string | null;
    profile_completed_at: string | null;
  };
  line_identity: {
    id: string;
    status: string;
    display_name: string;
    picture_url: string | null;
    bound_at: string;
    last_login_at: string | null;
  } | null;
  devices: {
    id: string;
    name: string;
    trusted: boolean;
    last_seen_at: string;
    revoked_at: string | null;
  }[];
  login_history: {
    provider: string;
    outcome: string;
    created_at: string;
    user_agent: string | null;
  }[];
  notification_settings: Record<string, boolean> | null;
  privacy_settings: Record<string, boolean> | null;
};

const successMessages: Record<string, string> = {
  profile_updated: "個人基本資料已更新。",
  settings_saved: "通知與隱私設定已儲存。",
  device_revoked: "裝置已登出。",
};

export default async function IdentityCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_identity_center");

  if (error || !data) return <Notice tone="error">無法載入會員中心。</Notice>;

  const center = data as Center;
  const notification = center.notification_settings ?? {};
  const privacy = center.privacy_settings ?? {};
  const completed = [
    center.profile.display_name,
    center.profile.phone,
    center.profile.email,
    center.profile.birth_date,
    center.line_identity,
  ].filter(Boolean).length;

  return <div className="page-stack">
    <header className="page-header">
      <div>
        <p className="eyebrow">會員中心</p>
        <h1>{center.profile.display_name}</h1>
        <p>管理個人資料、同社名冊公開範圍、LINE Login、登入裝置與通知。</p>
      </div>
    </header>

    {query.success && successMessages[query.success] && <Notice tone="success">{successMessages[query.success]}</Notice>}
    {query.error && <Notice tone="error">目前無法儲存設定，請檢查姓名、手機與 Email 格式後重試。</Notice>}

    <div className="metric-grid">
      <Card><span className="metric-label">資料完成度</span><strong className="metric-value">{completed * 20}%</strong></Card>
      <Card><span className="metric-label">LINE Login</span><strong className="metric-value metric-text">{center.line_identity?.status === "active" ? "已綁定" : "未綁定"}</strong></Card>
    </div>

    <div className="two-column">
      <Card>
        <h2>基本資料</h2>
        <p>姓名會同步成平台顯示名稱；手機與 Email 至少保留一項。</p>
        <form action={updateMyProfileAction} className="form-stack">
          <Field label="姓名"><Input name="name" required maxLength={160} defaultValue={center.profile.display_name} autoComplete="name" /></Field>
          <Field label="手機"><Input name="phone" maxLength={40} defaultValue={center.profile.phone ?? ""} autoComplete="tel" inputMode="tel" /></Field>
          <Field label="Email"><Input name="email" type="email" maxLength={320} defaultValue={center.profile.email ?? ""} autoComplete="email" /></Field>
          <Field label="生日"><Input name="birthDate" type="date" defaultValue={center.profile.birth_date ?? ""} /></Field>
          <Button type="submit">儲存基本資料</Button>
        </form>
      </Card>

      <Card>
        <h2>LINE Login 狀態</h2>
        {center.line_identity ? <>
          <div className="status-pair"><Badge tone="success">已綁定</Badge><Badge tone="neutral">身份驗證</Badge></div>
          <p>{center.line_identity.display_name}</p>
          <p className="subtle">綁定：{new Intl.DateTimeFormat("zh-TW").format(new Date(center.line_identity.bound_at))}</p>
        </> : <p>尚未綁定 LINE Login。正式綁定流程將在 V0.7 後續登入切片完成。</p>}
      </Card>
    </div>

    <Card>
      <h2>通知與名冊隱私</h2>
      <form action={updateIdentitySettingsAction} className="two-column">
        <div className="form-stack">
          <h3>通知</h3>
          {[
            ["lineEnabled", "LINE 通知", notification.line_enabled],
            ["emailEnabled", "Email 通知", notification.email_enabled],
            ["securityAlerts", "安全警示", notification.security_alerts],
            ["clubAnnouncements", "扶輪社公告", notification.club_announcements],
          ].map(([name, label, checked]) => <label className="checkbox-row" key={String(name)}>
            <input type="checkbox" name={String(name)} defaultChecked={checked !== false} />
            <span>{String(label)}</span>
          </label>)}
        </div>
        <div className="form-stack">
          <h3>同社名冊公開範圍</h3>
          {[
            ["showEmail", "向同社社員顯示 Email", privacy.show_email_to_club],
            ["showPhone", "向同社社員顯示手機", privacy.show_phone_to_club],
            ["showBirthYear", "向同社社員顯示出生年份", privacy.show_birthday_year],
            ["analyticsConsent", "匿名使用分析", privacy.analytics_consent],
          ].map(([name, label, checked]) => <label className="checkbox-row" key={String(name)}>
            <input type="checkbox" name={String(name)} defaultChecked={checked === true} />
            <span>{String(label)}</span>
          </label>)}
          <Notice>名冊不公開完整生日、登入資料、LINE subject 或管理識別碼。</Notice>
          <Button type="submit">儲存設定</Button>
        </div>
      </form>
    </Card>

    <section>
      <div className="section-heading"><h2>登入裝置</h2></div>
      <div className="table-wrap"><table>
        <thead><tr><th>裝置</th><th>最近使用</th><th>狀態</th><th>操作</th></tr></thead>
        <tbody>{center.devices.map((device) => <tr key={device.id}>
          <td>{device.name}</td>
          <td>{new Intl.DateTimeFormat("zh-TW", { dateStyle: "short", timeStyle: "short" }).format(new Date(device.last_seen_at))}</td>
          <td><Badge tone={device.revoked_at ? "danger" : "success"}>{device.revoked_at ? "已撤銷" : "有效"}</Badge></td>
          <td>{!device.revoked_at && <form action={revokeDeviceAction}><input type="hidden" name="deviceId" value={device.id} /><Button type="submit" className="button-secondary">登出此裝置</Button></form>}</td>
        </tr>)}</tbody>
      </table></div>
    </section>

    <section>
      <div className="section-heading"><h2>最近登入</h2></div>
      <div className="table-wrap"><table>
        <thead><tr><th>時間</th><th>方式</th><th>結果</th></tr></thead>
        <tbody>{center.login_history.map((history, index) => <tr key={`${history.created_at}-${index}`}>
          <td>{new Intl.DateTimeFormat("zh-TW", { dateStyle: "short", timeStyle: "medium" }).format(new Date(history.created_at))}</td>
          <td>{history.provider}</td>
          <td><Badge tone={history.outcome === "success" ? "success" : "danger"}>{history.outcome}</Badge></td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </div>;
}

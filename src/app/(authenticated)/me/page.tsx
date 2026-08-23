import { revokeDeviceAction, updateIdentitySettingsAction } from "@/app/actions";
import { unbindMyLineIdentityAction } from "@/app/identity-actions";
import { updateMyProfileAction } from "@/app/profile-actions";
import Link from "next/link";
import { Badge, Button, Card, Field, Input, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import {
  parseMyBlessingIouLedger,
  parseRotaryYearFilter,
} from "@/lib/blessing-iou/my-ledger";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { createClient } from "@/lib/supabase/server";
import { safeMessage } from "@/lib/validation";

type Center = {
  account: {
    status: string;
    has_active_access: boolean;
    has_password_login: boolean;
  };
  profile: {
    display_name: string;
    phone: string | null;
    email: string | null;
    birth_date: string | null;
    avatar_url: string | null;
    occupation: string | null;
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
    is_current: boolean;
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
  line_bound: "LINE Login 已綁定，可使用 LINE 登入平台。",
  line_rebound: "LINE Login 已重新綁定，舊的 LINE 身份與登入工作階段不再有效。",
};

const providerLabels: Record<string, string> = {
  password: "平台密碼",
  line: "LINE Login",
  line_mock: "LINE 模擬登入",
  invite: "邀請",
};


/** Numeric columns arrive as strings over PostgREST, so money is parsed once. */
function money(value: string | number | null | undefined) {
  const amount = typeof value === "string" ? Number(value) : value ?? 0;
  return Number.isFinite(amount) ? amount : 0;
}

function formatMoney(value: string | number | null | undefined) {
  return `NT$${money(value).toLocaleString("zh-TW")}`;
}

function rotaryYearLabel(year: number | null) {
  return year === null ? "全部年度總計" : `${year}–${String(year + 1).slice(-2)} 扶輪年度`;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export default async function IdentityCenterPage({
  searchParams,
}: {
  searchParams: Promise<{
    success?: string;
    error?: string;
    clubId?: string;
    rotaryYear?: string;
    mode?: string;
  }>;
}) {
  const [query, identity] = await Promise.all([searchParams, requireIdentity()]);
  // Both are request-cached and already resolved by the shell, so this costs
  // no additional round trip.
  const [attendance, blessingIou] = await Promise.all([
    evaluateCurrentFeatureFlag({ key: "attendance_ui_v2", subjectUuid: identity.id }),
    evaluateCurrentFeatureFlag({ key: "blessing_iou_v1", subjectUuid: identity.id }),
  ]);
  const supabase = await createClient();
  const selectedLedgerClub = typeof query.clubId === "string" && uuidPattern.test(query.clubId)
    ? query.clubId
    : null;
  const selectedRotaryYear = parseRotaryYearFilter(query.rotaryYear);
  // Issued together: the ledger is a separate question from the identity
  // centre, and waiting for one before asking the other would cost a round
  // trip for no reason.
  const [centerResult, ledgerResult] = await Promise.all([
    supabase.rpc("get_my_identity_center"),
    blessingIou.enabled
      ? supabase.rpc("get_my_blessing_iou_ledger", {
          p_club_id: selectedLedgerClub,
          p_rotary_year_start: selectedRotaryYear,
        })
      : Promise.resolve({ data: null, error: null }),
  ]);
  const { data, error } = centerResult;
  const ledger = parseMyBlessingIouLedger(ledgerResult.error ? null : ledgerResult.data);

  if (error || !data) return <Notice tone="error">無法載入會員中心。</Notice>;

  const center = data as Center;
  const ledgerYears = ledger?.selected_year !== null
    && ledger?.selected_year !== undefined
    && !ledger.available_years.includes(ledger.selected_year)
    ? [ledger.selected_year, ...ledger.available_years]
    : (ledger?.available_years ?? []);
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
    {query.error && <Notice tone="error">{safeMessage(query.error)}</Notice>}

    <div className="metric-grid">
      <Card><span className="metric-label">資料完成度</span><strong className="metric-value">{completed * 20}%</strong></Card>
      <Card><span className="metric-label">LINE Login</span><strong className="metric-value metric-text">{center.line_identity?.status === "active" ? "已綁定" : "未綁定"}</strong></Card>
      <Card><span className="metric-label">帳號狀態</span><strong className="metric-value metric-text">{center.account.status === "active" && center.account.has_active_access ? "可使用" : "受限制"}</strong></Card>
    </div>

    {ledger?.selected_club_id && ledger.totals && <Card className="identity-ledger-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">祝福 IOU</p>
          <h2>我的捐款</h2>
          <p>{rotaryYearLabel(ledger.selected_year)}</p>
        </div>
        <Link className="button button-secondary" href="/blessings">前往祝福牆</Link>
      </div>
      <form className="inline-form" action="/me">
        {query.mode && <input type="hidden" name="mode" value={query.mode} />}
        {ledger.clubs.length > 1 ? <label className="field">
          <span className="label">扶輪社</span>
          <select className="input" name="clubId" defaultValue={ledger.selected_club_id}>
            {ledger.clubs.map((club) => <option key={club.club_id} value={club.club_id}>{club.club_name}</option>)}
          </select>
        </label> : <input type="hidden" name="clubId" value={ledger.selected_club_id} />}
        <label className="field">
          <span className="label">查看期間</span>
          <select className="input" name="rotaryYear" defaultValue={ledger.selected_year === null ? "all" : String(ledger.selected_year)}>
            {ledgerYears.map((year) => <option key={year} value={year}>{rotaryYearLabel(year)}</option>)}
            <option value="all">全部年度總計</option>
          </select>
        </label>
        <Button type="submit">套用</Button>
      </form>
      <div className="metric-grid">
        <Card>
          <span className="metric-label">承諾金額</span>
          <strong className="metric-value">{formatMoney(ledger.totals.pledged_total)}</strong>
        </Card>
        <Card>
          <span className="metric-label">已收</span>
          <strong className="metric-value metric-text">{formatMoney(ledger.totals.collected_total)}</strong>
        </Card>
        <Card>
          <span className="metric-label">未收</span>
          <strong className="metric-value metric-text">{formatMoney(ledger.totals.outstanding_total)}</strong>
        </Card>
      </div>
      {ledger.entries.length === 0 ? <p className="subtle">這個期間還沒有捐款承諾。</p> : <div className="table-wrap">
        <table>
          <thead><tr><th>日期</th><th>內容</th><th>承諾</th><th>已收</th><th>未收</th></tr></thead>
          <tbody>
            {ledger.entries.map((entry) => <tr key={entry.entry_id}>
              <td>{entry.pledged_on}</td>
              <td>{entry.blessing_text.trim() || <span className="subtle">（僅捐款，未留文字）</span>}</td>
              <td>{entry.pledged_amount === null ? "—" : formatMoney(entry.pledged_amount)}</td>
              <td>{formatMoney(entry.collected_amount)}</td>
              <td>{formatMoney(entry.outstanding_amount)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>}
      <p className="hint">「已收」由社務幹部登記；金額是否對同社公開由您在祝福牆自行決定，這份明細只有您看得到。</p>
    </Card>}

    {attendance.enabled && <Card>
      <div className="section-heading">
        <div>
          <p className="eyebrow">出席紀錄</p>
          <h2>我的出席</h2>
        </div>
        <Link className="button button-secondary attendance-entry-link" href="/attendance">開啟出席紀錄</Link>
      </div>
      <p>本扶輪年度的出席率、逐月趨勢，以及每一場計入出席活動的結果。</p>
    </Card>}

    <div className="two-column">
      <Card>
        <h2>基本資料</h2>
        <p>姓名會同步成平台顯示名稱；手機與 Email 至少保留一項。</p>
        <form action={updateMyProfileAction} className="form-stack">
          <Field label="姓名"><Input name="name" required maxLength={160} defaultValue={center.profile.display_name} autoComplete="name" /></Field>
          <Field label="手機"><Input name="phone" maxLength={40} defaultValue={center.profile.phone ?? ""} autoComplete="tel" inputMode="tel" /></Field>
          <Field label="Email"><Input name="email" type="email" maxLength={320} defaultValue={center.profile.email ?? ""} autoComplete="email" /></Field>
          <Field label="生日"><Input name="birthDate" type="date" defaultValue={center.profile.birth_date ?? ""} /></Field>
          <Field label="職業" hint="會顯示在社員名冊卡片上"><Input name="occupation" maxLength={100} defaultValue={center.profile.occupation ?? ""} /></Field>
          <Button type="submit">儲存基本資料</Button>
        </form>
      </Card>

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
              <Field label="解除原因"><Input name="reason" required maxLength={500} defaultValue="本人於會員中心解除 LINE Login" /></Field>
              <Button type="submit" className="button-danger">確認解除 LINE Login</Button>
            </form>
          </> : <Notice>此帳號目前只有 LINE 登入方式，不能自行解除。請由秘書在社員管理中解除並產生重新綁定邀請。</Notice>}
        </div> : <div className="form-stack">
          <p>尚未綁定 LINE Login。綁定後可以用同一個 LINE 身份快速登入，不會建立第二個社員帳號。</p>
          <a className="button" href="/api/auth/line/start?flow=bind&returnTo=%2Fme">綁定 LINE Login</a>
        </div>}
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
          ].map(([name, label, checked]) => <label className="checkbox-row" key={String(name)}>
            <input type="checkbox" name={String(name)} defaultChecked={checked === true} />
            <span>{String(label)}</span>
          </label>)}
          <Notice>名冊不公開完整生日、登入資料、LINE subject 或管理識別碼。</Notice>
          {/* Stated rather than offered as a choice: the platform always
              collects this, so presenting a switch would promise a control
              that does not exist. */}
          <p className="subtle">
            平台會收集不具名的使用狀況以改善速度與穩定性。這些紀錄不包含姓名、
            聯絡方式或可回推到您帳號的識別碼。
          </p>
          <Button type="submit">儲存設定</Button>
        </div>
      </form>
    </Card>

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
          <td>{providerLabels[history.provider] ?? history.provider}</td>
          <td><Badge tone={history.outcome === "success" ? "success" : "danger"}>{history.outcome === "success" ? "成功" : history.outcome === "blocked" ? "已阻擋" : "失敗"}</Badge></td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </div>;
}

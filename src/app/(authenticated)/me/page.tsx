import { updateIdentitySettingsAction } from "@/app/actions";
import { updateMyProfileAction } from "@/app/profile-actions";
import Link from "next/link";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import {
  parseMyBlessingIouLedger,
  parseRotaryYearFilter,
} from "@/lib/blessing-iou/my-ledger";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import type { IdentityCenter } from "@/lib/identity-center";
import { createClient } from "@/lib/supabase/server";
import { safeMessage } from "@/lib/validation";

const successMessages: Record<string, string> = {
  profile_updated: "個人基本資料已更新。",
  settings_saved: "通知與隱私設定已儲存。",
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
  const [attendance, blessingIou, lineOaOnboarding] = await Promise.all([
    evaluateCurrentFeatureFlag({ key: "attendance_ui_v2", subjectUuid: identity.id }),
    evaluateCurrentFeatureFlag({ key: "blessing_iou_v1", subjectUuid: identity.id }),
    evaluateCurrentFeatureFlag({ key: "line_oa_onboarding_v1", subjectUuid: identity.id }),
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

  const center = data as IdentityCenter;
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
  ].filter(Boolean).length;

  return <div className="page-stack">
    <header className="page-header">
      <div>
        <p className="eyebrow">會員中心</p>
        <h1>{center.profile.display_name}</h1>
        <p>管理個人資料、同社名冊公開範圍與通知。</p>
      </div>
    </header>

    {query.success && successMessages[query.success] && <Notice tone="success">{successMessages[query.success]}</Notice>}
    {query.error && <Notice tone="error">{safeMessage(query.error)}</Notice>}

    <div className="metric-grid">
      <Card><span className="metric-label">資料完成度</span><strong className="metric-value">{completed * 25}%</strong></Card>
      <Card><span className="metric-label">LINE Login</span><strong className="metric-value metric-text">{center.line_identity?.status === "active" ? "已綁定" : "未綁定"}</strong></Card>
      <Card><span className="metric-label">帳號狀態</span><strong className="metric-value metric-text">{center.account.status === "active" && center.account.has_active_access ? "可使用" : "受限制"}</strong></Card>
    </div>

    {lineOaOnboarding.enabled && <Card>
      <div className="section-heading">
        <div>
          <p className="eyebrow">本社 LINE 官方帳號</p>
          <h2>LINE 通知連接</h2>
        </div>
        <Link className="button button-secondary" href="/me/line-oa">查看各社狀態</Link>
      </div>
      <p>加入目前社別的官方帳號，並確認是否已連接到您的社員身份。</p>
    </Card>}

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
        <p className="eyebrow">帳號安全</p>
        <h2>登入方式與裝置</h2>
        <p>LINE Login、平台密碼、登入裝置與最近登入紀錄集中在安全頁面，避免和一般個人資料混在一起。</p>
        <div className="metric-grid">
          <Card><span className="metric-label">LINE Login</span><strong className="metric-value metric-text">{center.line_identity?.status === "active" ? "已綁定" : "未綁定"}</strong></Card>
          <Card><span className="metric-label">平台密碼</span><strong className="metric-value metric-text">{center.account.has_password_login ? "可使用" : "未設定"}</strong></Card>
        </div>
        <Link className="button" href="/me/security">開啟帳號安全</Link>
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

  </div>;
}

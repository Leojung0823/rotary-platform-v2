import Link from "next/link";
import { notFound } from "next/navigation";
import {
  closeCheckinAction,
  configureCheckinAction,
  revokeAttendanceAction,
  startCheckinSessionAction,
} from "@/app/checkin-actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { DynamicCheckinQr } from "@/components/events/dynamic-checkin-qr";
import { ManualCheckinForm } from "@/components/events/manual-checkin-form";
import { Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { formatDateTime } from "@/lib/member-experience";
import { createClient } from "@/lib/supabase/server";

type Overview = {
  event: { id: string; title: string; location: string; starts_at: string; ends_at: string; status: string; counts_for_attendance: boolean };
  settings: null | { gps_enabled: boolean; qr_enabled: boolean; latitude: number | null; longitude: number | null; radius_meters: number | null; max_accuracy_meters: number | null; opens_at: string; closes_at: string; qr_rotation_seconds: number; window_open: boolean };
  active_session: null | { id: string; opens_at: string; expires_at: string; expired: boolean };
  summary: { active_members: number; checked_in: number };
  members: Array<{ membership_id: string; membership_number: string | null; display_name: string; checked_in: boolean; attendance_id: string | null; checked_in_at: string | null; checkin_method: string | null }>;
  attendance_history: Array<{ attendance_id: string; membership_id: string; display_name: string; status: "active" | "revoked"; checkin_method: "qr" | "gps" | "manual"; checked_in_at: string; checkin_note: string; location_accuracy_meters: number | null; distance_meters: number | null; revoked_at: string | null; revoke_reason: string | null }>;
  recent_attempts: Array<{ id: number; display_name: string | null; method: string; result_code: string; created_at: string }>;
};

function isOverview(value: unknown): value is Overview {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const overview = value as Record<string, unknown>;
  return Boolean(overview.event && overview.summary) && Array.isArray(overview.members) && Array.isArray(overview.attendance_history) && Array.isArray(overview.recent_attempts);
}

function taipeiInput(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

const successMessages: Record<string, string> = {
  settings_saved: "簽到方式與時間已儲存。",
  session_started: "現場 QR Code 簽到已開始。",
  session_closed: "簽到已結束，先前顯示的 QR Code 已立即失效。",
  manual_checked_in: "人工補登已完成。",
  already_checked_in: "這位社員已經完成簽到，沒有建立第二筆紀錄。",
  attendance_revoked: "簽到已撤銷並保留操作紀錄。",
};

const errorMessages: Record<string, string> = {
  forbidden: "您沒有管理這場活動簽到的權限。",
  not_eligible: "這場活動目前不能開放簽到，請確認活動已發布並計入出席。",
  window_closed: "目前不在設定的簽到時間內。",
  session_active: "請先結束目前的簽到，再修改簽到設定。",
  invalid_location: "請確認活動位置、簽到範圍與定位精確度設定。",
  invalid_window: "請確認簽到開始、結束時間與 QR Code 更新秒數。",
  invalid_input: "輸入資料不完整，請確認後再試一次。",
  unexpected: "操作暫時無法完成，請重新整理後再試一次。",
};

const methodLabels: Record<string, string> = { qr: "現場 QR Code", gps: "定位簽到", manual: "人工補登" };
const resultLabels: Record<string, string> = {
  success: "成功", already_checked_in: "已簽到", accuracy_insufficient: "定位不夠準確", outside_radius: "不在範圍內",
  credential_expired: "QR Code 已失效", credential_invalid: "QR Code 無效", session_closed: "簽到已結束", window_closed: "不在簽到時間", not_eligible: "不具簽到資格", rate_limited: "嘗試過於頻繁",
};

export default async function EventAttendanceManagementPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string; eventId: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  await requireIdentity();
  const [{ clubId, eventId }, query, supabase] = await Promise.all([params, searchParams, createClient()]);
  const result = await supabase.rpc("get_event_checkin_overview", { p_club_id: clubId, p_event_id: eventId });
  if (result.error || !isOverview(result.data)) notFound();
  const overview = result.data;
  const activeSession = overview.active_session && !overview.active_session.expired ? overview.active_session : null;
  const activeAttendances = overview.attendance_history.filter((item) => item.status === "active");
  const defaultOpens = overview.settings?.opens_at ?? new Date(new Date(overview.event.starts_at).getTime() - 60 * 60 * 1000).toISOString();
  const defaultCloses = overview.settings?.closes_at ?? overview.event.ends_at;

  return <div className="page-stack">
    <Link className="back-link" href={`/clubs/${clubId}/attendance`}>← 返回報名與簽到</Link>
    <header className="page-header"><div><h1>{overview.event.title}</h1><p>{formatDateTime(overview.event.starts_at, true)}｜{overview.event.location || "尚未填寫地點"}</p></div><div className="attendance-count"><strong>{overview.summary.checked_in}</strong><span>／{overview.summary.active_members} 位已簽到</span></div></header>
    {query.success && <Notice tone="success">{successMessages[query.success] ?? "操作已完成。"}</Notice>}
    {query.error && <Notice tone="error">{errorMessages[query.error] ?? errorMessages.unexpected}</Notice>}

    {!activeSession && <section className="card">
      <div className="section-heading"><h2>簽到設定</h2></div>
      <form action={configureCheckinAction} className="form-stack">
        <input type="hidden" name="clubId" value={clubId} /><input type="hidden" name="eventId" value={eventId} />
        <fieldset className="choice-fieldset"><legend>啟用方式（可複選）</legend><label className="checkbox-row"><input type="checkbox" name="gpsEnabled" defaultChecked={overview.settings?.gps_enabled ?? true} /><span><strong>GPS 定位簽到</strong></span></label><label className="checkbox-row"><input type="checkbox" name="qrEnabled" defaultChecked={overview.settings?.qr_enabled ?? true} /><span><strong>現場動態 QR Code</strong></span></label></fieldset>
        <div className="form-grid">
          <label className="field"><span className="label">活動緯度</span><input className="input" type="number" name="latitude" step="0.000001" defaultValue={overview.settings?.latitude ?? ""} placeholder="25.033964" /></label>
          <label className="field"><span className="label">活動經度</span><input className="input" type="number" name="longitude" step="0.000001" defaultValue={overview.settings?.longitude ?? ""} placeholder="121.564468" /></label>
          <label className="field"><span className="label">定位簽到範圍</span><select className="input" name="radiusMeters" defaultValue={overview.settings?.radius_meters ?? 200}><option value="100">100 公尺</option><option value="200">200 公尺</option><option value="500">500 公尺</option></select></label>
          <label className="field"><span className="label">可接受定位誤差</span><select className="input" name="maxAccuracyMeters" defaultValue={overview.settings?.max_accuracy_meters ?? 100}><option value="50">50 公尺</option><option value="100">100 公尺</option><option value="200">200 公尺</option></select></label>
          <label className="field"><span className="label">簽到開始時間</span><input className="input" type="datetime-local" name="opensAt" defaultValue={taipeiInput(defaultOpens)} required /></label>
          <label className="field"><span className="label">簽到結束時間</span><input className="input" type="datetime-local" name="closesAt" defaultValue={taipeiInput(defaultCloses)} required /></label>
          <label className="field"><span className="label">QR Code 更新頻率</span><select className="input" name="rotationSeconds" defaultValue={overview.settings?.qr_rotation_seconds ?? 45}><option value="30">每 30 秒</option><option value="45">每 45 秒</option><option value="60">每 60 秒</option></select></label>
        </div>
        <p className="hint">定位只會在社員主動簽到時取得一次。請先確認活動地點座標正確。</p>
        <button className="button" type="submit">儲存簽到設定</button>
      </form>
    </section>}

    {overview.settings && <section className="card">
      <div className="section-heading"><h2>現場簽到</h2><span>{overview.settings.window_open ? "簽到時間內" : "目前未開放"}</span></div>
      <p>已啟用：{[overview.settings.gps_enabled && "GPS 定位", overview.settings.qr_enabled && "動態 QR Code"].filter(Boolean).join("、")}</p>
      <p>時間：{formatDateTime(overview.settings.opens_at, true)}－{formatDateTime(overview.settings.closes_at, true)}</p>
      {overview.settings.qr_enabled && overview.settings.window_open && !activeSession && <form action={startCheckinSessionAction}><input type="hidden" name="clubId" value={clubId} /><input type="hidden" name="eventId" value={eventId} /><button className="button" type="submit">開始 QR Code 簽到</button></form>}
      {activeSession && overview.settings.qr_enabled && <DynamicCheckinQr clubId={clubId} eventId={eventId} />}
      {overview.settings.window_open && <details className="danger-details"><summary>結束簽到</summary><form action={closeCheckinAction} className="form-stack"><input type="hidden" name="clubId" value={clubId} /><input type="hidden" name="eventId" value={eventId} /><label className="field"><span className="label">結束原因</span><input className="input" name="reason" maxLength={500} required /></label><ConfirmSubmitButton className="button button-danger" type="submit" confirmMessage="確定要結束簽到嗎？目前顯示的 QR Code 將立即失效，定位簽到也會停止。">確認結束簽到</ConfirmSubmitButton></form></details>}
    </section>}

    {overview.settings?.window_open && <section className="card"><div className="section-heading"><h2>人工補登</h2></div><p>社員無法使用手機、定位、相機、網路或登入時，請先現場核對身分。</p><ManualCheckinForm clubId={clubId} eventId={eventId} members={overview.members} /></section>}

    <section><div className="section-heading"><h2>目前簽到名單</h2><span>{activeAttendances.length} 位</span></div>
      {activeAttendances.length === 0 ? <Notice>尚無社員完成簽到。</Notice> : <div className="management-card-list">{activeAttendances.map((attendance) => <article className="card attendance-row" key={attendance.attendance_id}><div><h3>{attendance.display_name}</h3><p>{methodLabels[attendance.checkin_method]}｜{formatDateTime(attendance.checked_in_at, true)}</p></div><details className="danger-details"><summary>撤銷簽到</summary><form action={revokeAttendanceAction} className="form-stack"><input type="hidden" name="clubId" value={clubId} /><input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="attendanceId" value={attendance.attendance_id} /><label className="field"><span className="label">撤銷原因</span><input className="input" name="reason" maxLength={500} required /></label><ConfirmSubmitButton className="button button-danger" type="submit" confirmMessage={`確定要撤銷 ${attendance.display_name} 的簽到嗎？`}>確認撤銷</ConfirmSubmitButton></form></details></article>)}</div>}
    </section>

    <section><div className="section-heading"><h2>最近簽到結果</h2></div><div className="compact-list">{overview.recent_attempts.slice(0, 20).map((attempt) => <div className="attempt-row" key={attempt.id}><span><strong>{attempt.display_name || "未辨識的使用者"}</strong><small>{formatDateTime(attempt.created_at, true)}｜{methodLabels[attempt.method] ?? attempt.method}</small></span><span>{resultLabels[attempt.result_code] ?? "未完成"}</span></div>)}</div></section>
  </div>;
}

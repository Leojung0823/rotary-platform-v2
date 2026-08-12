import Link from "next/link";
import {
  closeCheckinAction,
  manualCheckinAction,
  revokeAttendanceAction,
} from "@/app/checkin-actions";
import { DynamicCheckinControls } from "@/components/events/dynamic-checkin-controls";
import {
  DynamicCloseCheckinForm,
  DynamicManualCheckinForm,
  DynamicRevokeAttendanceForm,
} from "@/components/events/dynamic-checkin-management-forms";
import { CheckinTokenControls } from "@/components/events/checkin-token-controls";
import { requireIdentity } from "@/lib/auth";
import { parseCheckinUuid } from "@/lib/checkin/validation";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { createClient } from "@/lib/supabase/server";

type CheckinEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: "draft" | "published" | "cancelled" | "completed";
  counts_for_attendance: boolean;
  checkin_window_open: boolean;
};

type ActiveSession = {
  id: string;
  token_prefix: string;
  opens_at: string;
  expires_at: string;
  expired: boolean;
};

type CheckinMember = {
  membership_id: string;
  display_name: string;
  checked_in: boolean;
  attendance_id: string | null;
  checked_in_at: string | null;
  checkin_method: "qr" | "manual" | null;
};

type AttendanceHistory = {
  attendance_id: string;
  membership_id: string;
  display_name: string;
  status: "active" | "revoked";
  checkin_method: "qr" | "manual";
  checked_in_at: string;
  checkin_note: string;
  revoked_at: string | null;
  revoke_reason: string | null;
};

type CheckinOverview = {
  event: CheckinEvent;
  active_session: ActiveSession | null;
  members: CheckinMember[];
  attendance_history: AttendanceHistory[];
};

const successMessages: Record<string, string> = {
  session_closed: "簽到場次已關閉，原 token 立即失效。",
  manual_checked_in: "人工補登已完成。",
  already_checked_in: "該社員已有有效簽到，系統未建立重複紀錄。",
  attendance_revoked: "簽到已撤銷，原始紀錄仍保留在歷史中。",
};

const errorMessages: Record<string, string> = {
  invalid_input: "輸入內容不完整或格式不正確。",
  forbidden: "目前帳號沒有管理此活動簽到的權限。",
  not_eligible: "只有已發布且計入出席的活動可以簽到。",
  window_closed: "目前不在活動前後 24 小時的簽到管理時間窗。",
  already_open: "已有有效簽到 token。",
  not_open: "目前沒有有效簽到 token。",
  not_found: "找不到可操作的簽到紀錄。",
  unexpected: "目前無法完成操作，請稍後再試。",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCheckinEvent(value: unknown): value is CheckinEvent {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.title === "string"
    && typeof value.starts_at === "string"
    && typeof value.ends_at === "string"
    && (value.status === "draft" || value.status === "published" || value.status === "cancelled" || value.status === "completed")
    && typeof value.counts_for_attendance === "boolean"
    && typeof value.checkin_window_open === "boolean";
}

function isActiveSession(value: unknown): value is ActiveSession {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.token_prefix === "string"
    && typeof value.opens_at === "string"
    && typeof value.expires_at === "string"
    && typeof value.expired === "boolean";
}

function isCheckinMember(value: unknown): value is CheckinMember {
  if (!isRecord(value)) return false;
  return typeof value.membership_id === "string"
    && typeof value.display_name === "string"
    && typeof value.checked_in === "boolean"
    && (value.attendance_id === null || typeof value.attendance_id === "string")
    && (value.checked_in_at === null || typeof value.checked_in_at === "string")
    && (value.checkin_method === null || value.checkin_method === "qr" || value.checkin_method === "manual");
}

function isAttendanceHistory(value: unknown): value is AttendanceHistory {
  if (!isRecord(value)) return false;
  return typeof value.attendance_id === "string"
    && typeof value.membership_id === "string"
    && typeof value.display_name === "string"
    && (value.status === "active" || value.status === "revoked")
    && (value.checkin_method === "qr" || value.checkin_method === "manual")
    && typeof value.checked_in_at === "string"
    && typeof value.checkin_note === "string"
    && (value.revoked_at === null || typeof value.revoked_at === "string")
    && (value.revoke_reason === null || typeof value.revoke_reason === "string");
}

function parseOverview(value: unknown): CheckinOverview | null {
  if (!isRecord(value) || !isCheckinEvent(value.event)) return null;
  if (value.active_session !== null && !isActiveSession(value.active_session)) return null;
  if (!Array.isArray(value.members) || !value.members.every(isCheckinMember)) return null;
  if (!Array.isArray(value.attendance_history) || !value.attendance_history.every(isAttendanceHistory)) return null;
  return {
    event: value.event,
    active_session: value.active_session,
    members: value.members,
    attendance_history: value.attendance_history,
  };
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export default async function EventCheckinManagementPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ clubId?: string; success?: string; error?: string }>;
}) {
  const identity = await requireIdentity();
  const route = await params;
  const query = await searchParams;
  let eventId: string;
  let clubId: string;
  try {
    eventId = parseCheckinUuid(route.eventId);
    clubId = parseCheckinUuid(query.clubId ?? null);
  } catch {
    return <div className="page-stack narrow">
      <div className="notice notice-error" role="alert">活動或扶輪社識別碼無效。</div>
      <Link className="button button-secondary" href="/events">返回活動</Link>
    </div>;
  }

  const supabase = await createClient();
  const checkinV2 = await evaluateCurrentFeatureFlag({ key: "checkin_qr_v2", subjectUuid: identity.id });
  const { data, error } = await supabase.rpc("get_event_checkin_overview", {
    p_club_id: clubId,
    p_event_id: eventId,
  });
  const overview = error ? null : parseOverview(data);
  if (!overview) {
    return <div className="page-stack narrow">
      <header className="page-header"><div><p className="eyebrow">活動簽到</p><h1>無法載入簽到管理</h1></div></header>
      <div className="notice notice-error" role="alert">目前無法確認活動、社別或管理權限。系統不會把權限錯誤當成空資料。</div>
      <Link className="button button-secondary" href={`/events?clubId=${encodeURIComponent(clubId)}`}>返回活動</Link>
    </div>;
  }

  const usableSession = overview.active_session && !overview.active_session.expired ? overview.active_session : null;
  const availableMembers = overview.members.filter((member) => !member.checked_in);
  const activeAttendances = overview.attendance_history.filter((attendance) => attendance.status === "active");

  return <div className="page-stack">
    <header className="page-header">
      <div>
        <p className="eyebrow">活動簽到管理</p>
        <h1>{overview.event.title}</h1>
        <p>{formatDateTime(overview.event.starts_at)}－{formatDateTime(overview.event.ends_at)}</p>
      </div>
      <div className="form-actions">
        <Link className="button button-secondary" href={`/events?clubId=${encodeURIComponent(clubId)}`}>返回活動</Link>
        <Link className="button" href="/events/checkin">社員簽到入口</Link>
      </div>
    </header>

    {query.success && successMessages[query.success] && <div className="notice notice-success" role="status">
      {successMessages[query.success]}
    </div>}
    {query.error && <div className="notice notice-error" role="alert">
      {errorMessages[query.error] ?? errorMessages.unexpected}
    </div>}

    {!overview.event.counts_for_attendance && <div className="notice notice-info">此活動未設定計入出席，因此不能開啟簽到。</div>}
    {overview.event.status !== "published" && <div className="notice notice-info">活動狀態不是已發布，目前不能新增簽到。</div>}
    {!overview.event.checkin_window_open && <div className="notice notice-info">簽到管理僅允許在活動開始前 24 小時至結束後 24 小時內開啟。</div>}

    <section className="card">
      <div className="section-heading">
        <div><p className="eyebrow">{checkinV2.enabled ? "短效動態 QR" : "短效 token"}</p><h2>簽到場次</h2></div>
        {usableSession
          ? <span className="badge badge-success">有效至 {formatDateTime(usableSession.expires_at)}</span>
          : <span className="badge badge-neutral">目前未開啟</span>}
      </div>
      {overview.active_session?.expired && <div className="notice notice-info">前一個 token 已到期；重新開啟時資料庫會先關閉舊場次。</div>}
      {checkinV2.enabled
        ? <DynamicCheckinControls clubId={clubId} eventId={eventId} hasActiveSession={Boolean(usableSession)} />
        : <CheckinTokenControls clubId={clubId} eventId={eventId} hasActiveSession={Boolean(usableSession)} />}
      {usableSession && (checkinV2.enabled
        ? <DynamicCloseCheckinForm clubId={clubId} eventId={eventId} />
        : <form action={closeCheckinAction} className="inline-form">
          <input type="hidden" name="clubId" value={clubId} />
          <input type="hidden" name="eventId" value={eventId} />
          <label className="field"><span className="label">關閉原因</span><input className="input" name="reason" maxLength={500} required /></label>
          <span className="hint">識別前綴：{usableSession.token_prefix}。關閉後 token 立即失效。</span>
          <button className="button button-danger" type="submit">關閉簽到</button>
        </form>)}
    </section>

    <section className="card">
      <div className="section-heading">
        <div><p className="eyebrow">現場補登</p><h2>人工簽到</h2></div>
        <span>{activeAttendances.length} 位已簽到</span>
      </div>
      {availableMembers.length === 0
        ? <div className="notice notice-info">目前所有 active 社員都已有有效簽到。</div>
        : checkinV2.enabled
          ? <DynamicManualCheckinForm clubId={clubId} eventId={eventId} members={availableMembers.map((member) => ({ membershipId: member.membership_id, displayName: member.display_name }))} />
          : <form action={manualCheckinAction} className="inline-form">
          <input type="hidden" name="clubId" value={clubId} />
          <input type="hidden" name="eventId" value={eventId} />
          <label className="field"><span className="label">社員</span>
            <select className="input" name="membershipId" required defaultValue="">
              <option value="" disabled>選擇社員</option>
              {availableMembers.map((member) => <option key={member.membership_id} value={member.membership_id}>{member.display_name}</option>)}
            </select>
          </label>
          <label className="field"><span className="label">補登原因</span><input className="input" name="reason" maxLength={500} required /></label>
          <button className="button" type="submit">人工補登</button>
          </form>}
    </section>

    <section>
      <div className="section-heading">
        <div><p className="eyebrow">有效紀錄</p><h2>目前簽到名單</h2></div>
        <span>{activeAttendances.length} 人</span>
      </div>
      {activeAttendances.length === 0
        ? <div className="empty"><div className="empty-icon">到</div><h2>尚無簽到</h2><p>社員掃描或管理者補登後會顯示在這裡。</p></div>
        : <div className="table-wrap"><table>
          <thead><tr><th>社員</th><th>方式</th><th>時間</th><th>操作</th></tr></thead>
          <tbody>{activeAttendances.map((attendance) => <tr key={attendance.attendance_id}>
            <td><strong>{attendance.display_name}</strong></td>
            <td>{attendance.checkin_method === "qr" ? "本人 token" : "人工補登"}</td>
            <td>{formatDateTime(attendance.checked_in_at)}</td>
            <td>{checkinV2.enabled
              ? <DynamicRevokeAttendanceForm clubId={clubId} eventId={eventId} attendance={{ attendanceId: attendance.attendance_id, displayName: attendance.display_name }} />
              : <form action={revokeAttendanceAction} className="inline-form">
              <input type="hidden" name="clubId" value={clubId} />
              <input type="hidden" name="eventId" value={eventId} />
              <input type="hidden" name="attendanceId" value={attendance.attendance_id} />
              <label className="field"><span className="sr-only">撤銷原因</span><input className="input" name="reason" placeholder="撤銷原因" maxLength={500} required /></label>
              <button className="button button-danger" type="submit">撤銷</button>
              </form>}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>

    <section>
      <div className="section-heading">
        <div><p className="eyebrow">不可刪除歷史</p><h2>簽到紀錄</h2></div>
        <span>{overview.attendance_history.length} 筆</span>
      </div>
      {overview.attendance_history.length === 0
        ? <div className="notice notice-info">尚無簽到歷史。</div>
        : <div className="table-wrap"><table>
          <thead><tr><th>社員</th><th>方式</th><th>簽到時間</th><th>狀態</th><th>說明</th></tr></thead>
          <tbody>{overview.attendance_history.map((attendance) => <tr key={attendance.attendance_id}>
            <td>{attendance.display_name}</td>
            <td>{attendance.checkin_method === "qr" ? "本人 token" : "人工補登"}</td>
            <td>{formatDateTime(attendance.checked_in_at)}</td>
            <td><span className={`badge ${attendance.status === "active" ? "badge-success" : "badge-danger"}`}>
              {attendance.status === "active" ? "有效" : "已撤銷"}
            </span></td>
            <td>{attendance.status === "revoked" ? attendance.revoke_reason : attendance.checkin_note || "—"}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>
  </div>;
}

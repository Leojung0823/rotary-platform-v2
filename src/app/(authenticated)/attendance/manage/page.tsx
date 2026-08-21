import Link from "next/link";
import { notFound } from "next/navigation";
import {
  revokeAttendanceAdjustmentAction,
  setAttendanceAdjustmentAction,
} from "@/app/attendance-actions";
import { EmptyState, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import {
  adjustmentTypeLabels,
  attendanceStatusBadge,
  attendanceStatusLabels,
  checkinMethodLabels,
  formatAttendanceDate,
  formatAttendanceDateTime,
  formatAttendanceRate,
  formatTrendPeriod,
} from "@/lib/attendance/presentation";
import { ADJUSTMENT_TYPES, parseAttendanceRange } from "@/lib/attendance/validation";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { createClient } from "@/lib/supabase/server";

type ManagedClub = { club_id: string; club_code: string; club_name: string; can_manage: boolean };

type ClubSummary = {
  average_attendance_rate: number;
  denominator: number;
  attended: number;
  pending_absences: number;
  unconfirmed_records: number;
  trend: { period: string; denominator: number; attended: number; attendance_rate: number }[];
};

type AttendanceEvent = {
  event_id: string;
  title: string;
  starts_at: string;
  event_date: string;
  status: string;
};

type RosterMember = {
  membership_id: string;
  display_name: string;
  membership_status: string;
  final_status: string;
  in_denominator: boolean;
  attendance_credit: boolean;
  raw_checkin_method: string | null;
  raw_checked_in_at: string | null;
  adjustment_id: string | null;
  adjustment_type: string | null;
  adjustment_reason: string | null;
};

type Roster = {
  event: { title: string; starts_at: string; status: string; counts_for_attendance: boolean };
  members: RosterMember[];
  adjustment_history: {
    adjustment_id: string;
    display_name: string;
    adjustment_type: string;
    reason: string;
    created_at: string;
    revoked_at: string | null;
    revocation_reason: string | null;
  }[];
};

const successMessages: Record<string, string> = {
  adjustment_saved: "出席調整已記錄，統計會立即反映。",
  adjustment_revoked: "出席調整已撤銷，原始簽到結果恢復生效。",
};

const errorMessages: Record<string, string> = {
  invalid_input: "輸入內容不完整或格式不正確，請確認後再試。",
  forbidden: "目前帳號沒有調整此扶輪社出席紀錄的權限。",
  member_not_eligible: "該社員在這場活動沒有出席資格，無法調整。",
  event_not_eligible: "這場活動不計入出席，或狀態不允許調整。",
  already_adjusted: "這位社員在這場活動已有生效中的調整，請先撤銷原調整。",
  adjustment_missing: "找不到該筆調整，可能已被撤銷。",
  unexpected: "目前無法完成操作，請稍後再試。",
};

function isManagedClub(value: unknown): value is ManagedClub {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const club = value as Record<string, unknown>;
  return typeof club.club_id === "string"
    && typeof club.club_code === "string"
    && typeof club.club_name === "string"
    && typeof club.can_manage === "boolean";
}

function parseClubSummary(value: unknown): ClubSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const summary = value as Record<string, unknown>;
  const numbers = ["average_attendance_rate", "denominator", "attended", "pending_absences", "unconfirmed_records"];
  if (!numbers.every((key) => typeof summary[key] === "number")) return null;
  if (!Array.isArray(summary.trend)) return null;
  return summary as unknown as ClubSummary;
}

function parseEvents(value: unknown): AttendanceEvent[] | null {
  if (!Array.isArray(value)) return null;
  const valid = value.every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const event = entry as Record<string, unknown>;
    return typeof event.event_id === "string"
      && typeof event.title === "string"
      && typeof event.starts_at === "string"
      && typeof event.event_date === "string";
  });
  return valid ? (value as AttendanceEvent[]) : null;
}

function parseRoster(value: unknown): Roster | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const roster = value as Record<string, unknown>;
  if (!roster.event || typeof roster.event !== "object") return null;
  if (!Array.isArray(roster.members)) return null;
  return roster as unknown as Roster;
}

function ManageHeader() {
  return <header className="page-header">
    <div>
      <p className="eyebrow">社務管理</p>
      <h1>出席管理與統計</h1>
      <p>查看全社出席率、逐場名冊，並在有正當理由時登記請假、公假、補出席或免計。</p>
    </div>
    <Link className="button button-secondary" href="/attendance">我的出席</Link>
  </header>;
}

export default async function AttendanceManagePage({
  searchParams,
}: {
  searchParams: Promise<{
    clubId?: string;
    eventId?: string;
    dateFrom?: string;
    dateTo?: string;
    success?: string;
    error?: string;
  }>;
}) {
  const [identity, params] = await Promise.all([requireIdentity(), searchParams]);
  const evaluation = await evaluateCurrentFeatureFlag({
    key: "attendance_ui_v2",
    subjectUuid: identity.id,
  });
  if (!evaluation.enabled) notFound();

  let range: { dateFrom: string; dateTo: string } | null = null;
  let rangeRejected = false;
  try {
    range = parseAttendanceRange(params.dateFrom, params.dateTo);
  } catch {
    rangeRejected = true;
  }

  const supabase = await createClient();
  // One call returns the managed club list, the club summary, the events that
  // count for attendance, and -- when one is selected -- its roster.
  const { data, error } = await supabase.rpc("get_club_attendance_page", {
    p_club_id: params.clubId ?? null,
    p_date_from: range?.dateFrom ?? null,
    p_date_to: range?.dateTo ?? null,
    p_event_id: params.eventId ?? null,
  });

  const projection = (data ?? {}) as Record<string, unknown>;
  const clubRows = Array.isArray(projection.clubs) ? projection.clubs : null;
  if (error || !clubRows || !clubRows.every(isManagedClub)) {
    return <div className="page-stack">
      <ManageHeader />
      <Notice tone="error">目前無法確認出席管理權限，請稍後重新整理。</Notice>
    </div>;
  }

  const selectedClub = clubRows.find((club) => club.club_id === projection.selected_club_id) ?? null;
  const summary = parseClubSummary(projection.summary);
  const events = parseEvents(projection.events);
  const roster = parseRoster(projection.roster);
  const selectedEventId = typeof projection.selected_event_id === "string" ? projection.selected_event_id : null;
  const dateFrom = typeof projection.date_from === "string" ? projection.date_from : null;
  const dateTo = typeof projection.date_to === "string" ? projection.date_to : null;

  const linkFor = (eventId: string | null) => {
    if (!selectedClub) return "/attendance/manage";
    const query = new URLSearchParams({ clubId: selectedClub.club_id });
    if (eventId) query.set("eventId", eventId);
    if (dateFrom && dateTo) { query.set("dateFrom", dateFrom); query.set("dateTo", dateTo); }
    return `/attendance/manage?${query.toString()}`;
  };

  return <div className="page-stack">
    <ManageHeader />

    {params.success && successMessages[params.success] && <Notice tone="success">
      {successMessages[params.success]}
    </Notice>}
    {params.error && <Notice tone="error">
      {errorMessages[params.error] ?? errorMessages.unexpected}
    </Notice>}
    {rangeRejected && <Notice tone="error">
      查詢期間不正確，已改用預設期間。起訖日必須是有效日期，且間隔不超過 366 天。
    </Notice>}

    {clubRows.length === 0 && <EmptyState
      title="目前沒有可管理出席的扶輪社"
      body="需要該社的出席管理權限（社長、秘書、執行秘書）才能使用這個頁面。"
    />}

    {clubRows.length > 1 && <section>
      <div className="section-heading"><h2>選擇扶輪社</h2></div>
      <div className="club-grid">
        {clubRows.map((club) => <Link
          key={club.club_id}
          href={`/attendance/manage?clubId=${encodeURIComponent(club.club_id)}`}
          className="club-card"
          aria-current={selectedClub?.club_id === club.club_id ? "page" : undefined}
        >
          <div><span className="club-code">{club.club_code}</span><h3>{club.club_name}</h3></div>
          <span className="card-link">{selectedClub?.club_id === club.club_id ? "目前顯示" : "查看出席 →"}</span>
        </Link>)}
      </div>
    </section>}

    {selectedClub && dateFrom && dateTo && <section className="card">
      <div className="section-heading">
        <div><p className="eyebrow">查詢期間</p><h2>{selectedClub.club_name}</h2></div>
        <span>{formatAttendanceDate(dateFrom)}－{formatAttendanceDate(dateTo)}</span>
      </div>
      <form className="inline-form" method="get">
        <input type="hidden" name="clubId" value={selectedClub.club_id} />
        <label className="field"><span className="label">起</span>
          <input className="input" type="date" name="dateFrom" defaultValue={dateFrom} />
        </label>
        <label className="field"><span className="label">迄</span>
          <input className="input" type="date" name="dateTo" defaultValue={dateTo} />
        </label>
        <button className="button button-secondary" type="submit">重新統計</button>
      </form>
      <p className="hint">未指定期間時，預設統計本扶輪年度（7 月 1 日起）至今。</p>
    </section>}

    {selectedClub && !summary && <Notice tone="error">目前無法載入全社出席統計。</Notice>}

    {summary && <section>
      <div className="section-heading">
        <div><p className="eyebrow">統計</p><h2>全社出席</h2></div>
        <span>{summary.attended} / {summary.denominator} 人次計入</span>
      </div>
      <div className="metric-grid">
        <div className="card">
          <span className="metric-label">平均出席率</span>
          <strong className="metric-value">{formatAttendanceRate(summary.average_attendance_rate)}</strong>
          <p>依每位社員在每場計入活動的出席資格計算。</p>
        </div>
        <div className="card">
          <span className="metric-label">已結束活動的缺席</span>
          <strong className="metric-value metric-text">{summary.pending_absences} 人次</strong>
          <p>可視情況登記請假、公假或補出席。</p>
        </div>
        <div className="card">
          <span className="metric-label">尚未確定</span>
          <strong className="metric-value metric-text">{summary.unconfirmed_records} 人次</strong>
          <p>活動仍在進行中，簽到後即會更新。</p>
        </div>
      </div>

      {summary.trend.length > 0 && <div className="card">
        <div className="section-heading"><h3>逐月出席率</h3></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>月份</th><th>計入人次</th><th>出席</th><th>出席率</th></tr></thead>
            <tbody>
              {summary.trend.map((point) => <tr key={point.period}>
                <td>{formatTrendPeriod(point.period)}</td>
                <td>{point.denominator}</td>
                <td>{point.attended}</td>
                <td>{formatAttendanceRate(point.attendance_rate)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>}
    </section>}

    {selectedClub && events !== null && events.length === 0 && <EmptyState
      title="這段期間沒有計入出席的活動"
      body="只有已發布或已結束、設定為計入出席，且已經開始的活動會列在這裡。"
    />}

    {selectedClub && events !== null && events.length > 0 && <section>
      <div className="section-heading">
        <div><p className="eyebrow">逐場名冊</p><h2>選擇活動</h2></div>
        <span>{events.length} 場</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>日期</th><th>活動</th><th>狀態</th><th>名冊</th></tr></thead>
          <tbody>
            {events.map((event) => <tr key={event.event_id}>
              <td>{formatAttendanceDate(event.event_date)}</td>
              <td>{event.title}</td>
              <td>{event.status === "completed" ? "已結束" : "已發布"}</td>
              <td>
                {selectedEventId === event.event_id
                  ? <span className="badge badge-success">目前顯示</span>
                  : <Link className="card-link" href={linkFor(event.event_id)}>查看名冊 →</Link>}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>}

    {selectedClub && selectedEventId && !roster && <Notice tone="error">
      目前無法載入這場活動的出席名冊。
    </Notice>}

    {selectedClub && selectedEventId && roster && <section>
      <div className="section-heading">
        <div><p className="eyebrow">出席名冊</p><h2>{roster.event.title}</h2></div>
        <a
          className="button button-secondary"
          href={`/api/v1/clubs/${encodeURIComponent(selectedClub.club_id)}/attendance/export?eventId=${encodeURIComponent(selectedEventId)}`}
        >匯出 CSV</a>
      </div>
      <p className="hint">{formatAttendanceDateTime(roster.event.starts_at)} · {roster.members.length} 位社員</p>

      <div className="form-stack">
        {roster.members.map((member) => <article className="card" key={member.membership_id}>
          <div className="section-heading">
            <div>
              <div className="status-pair">
                <span className={attendanceStatusBadge(member.final_status)}>
                  {attendanceStatusLabels[member.final_status as keyof typeof attendanceStatusLabels] ?? member.final_status}
                </span>
                {!member.in_denominator && <span className="badge badge-neutral">不計分母</span>}
                {member.adjustment_type && <span className="badge badge-warning">
                  已調整：{adjustmentTypeLabels[member.adjustment_type as keyof typeof adjustmentTypeLabels] ?? member.adjustment_type}
                </span>}
              </div>
              <h3>{member.display_name}</h3>
            </div>
            <span>{member.raw_checked_in_at
              ? `${checkinMethodLabels[member.raw_checkin_method ?? ""] ?? "已簽到"} · ${formatAttendanceDateTime(member.raw_checked_in_at)}`
              : "未簽到"}</span>
          </div>

          {member.adjustment_reason && <p className="hint">調整原因：{member.adjustment_reason}</p>}

          {member.adjustment_id
            ? <form action={revokeAttendanceAdjustmentAction} className="inline-form">
              <input type="hidden" name="clubId" value={selectedClub.club_id} />
              <input type="hidden" name="eventId" value={selectedEventId} />
              <input type="hidden" name="adjustmentId" value={member.adjustment_id} />
              <label className="field"><span className="label">撤銷原因</span>
                <input className="input" name="revocationReason" maxLength={500} required />
              </label>
              <button className="button button-danger" type="submit">撤銷調整</button>
            </form>
            : <form action={setAttendanceAdjustmentAction} className="inline-form">
              <input type="hidden" name="clubId" value={selectedClub.club_id} />
              <input type="hidden" name="eventId" value={selectedEventId} />
              <input type="hidden" name="membershipId" value={member.membership_id} />
              <label className="field"><span className="label">調整為</span>
                <select className="input" name="adjustmentType" defaultValue="leave">
                  {ADJUSTMENT_TYPES.map((type) => <option key={type} value={type}>
                    {adjustmentTypeLabels[type]}
                  </option>)}
                </select>
              </label>
              <label className="field"><span className="label">原因</span>
                <input className="input" name="reason" maxLength={500} required />
              </label>
              <button className="button" type="submit">登記調整</button>
            </form>}
        </article>)}
      </div>

      {roster.adjustment_history.length > 0 && <div className="card">
        <div className="section-heading"><h3>調整紀錄</h3></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>社員</th><th>類型</th><th>原因</th><th>時間</th><th>狀態</th></tr></thead>
            <tbody>
              {roster.adjustment_history.map((entry) => <tr key={entry.adjustment_id}>
                <td>{entry.display_name}</td>
                <td>{adjustmentTypeLabels[entry.adjustment_type as keyof typeof adjustmentTypeLabels] ?? entry.adjustment_type}</td>
                <td>{entry.reason}</td>
                <td>{formatAttendanceDateTime(entry.created_at)}</td>
                <td>{entry.revoked_at
                  ? `已撤銷（${entry.revocation_reason ?? "未填原因"}）`
                  : "生效中"}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>}
    </section>}
  </div>;
}

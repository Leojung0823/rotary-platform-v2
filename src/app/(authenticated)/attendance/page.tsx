import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import {
  attendanceStatusBadge,
  attendanceStatusLabels,
  checkinMethodLabels,
  formatAttendanceDate,
  formatAttendanceDateTime,
  formatAttendanceRate,
  formatTrendPeriod,
  type AttendanceStatus,
} from "@/lib/attendance/presentation";
import { parseAttendanceRange } from "@/lib/attendance/validation";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { createClient } from "@/lib/supabase/server";

type AttendanceClub = {
  club_id: string;
  club_code: string;
  club_name: string;
  membership_id: string | null;
  can_manage: boolean;
};

type AttendanceSummary = {
  date_from: string;
  date_to: string;
  denominator: number;
  attended: number;
  attendance_rate: number;
  present: number;
  makeup: number;
  official_leave: number;
  leave: number;
  exempt: number;
  absent: number;
  pending_absences: number;
  unconfirmed_records: number;
  trend: { period: string; denominator: number; attended: number; attendance_rate: number }[];
};

type AttendanceRecord = {
  event_date: string;
  event_title: string;
  final_status: AttendanceStatus;
  in_denominator: boolean;
  attendance_credit: boolean;
  raw_checkin_method: string | null;
  raw_checked_in_at: string | null;
  adjustment_type: string | null;
  adjustment_reason: string | null;
};

function isAttendanceClub(value: unknown): value is AttendanceClub {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const club = value as Record<string, unknown>;
  return typeof club.club_id === "string"
    && typeof club.club_code === "string"
    && typeof club.club_name === "string"
    && (typeof club.membership_id === "string" || club.membership_id === null)
    && typeof club.can_manage === "boolean";
}

function parseSummary(value: unknown): AttendanceSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const summary = value as Record<string, unknown>;
  const numbers = [
    "denominator", "attended", "attendance_rate", "present", "makeup",
    "official_leave", "leave", "exempt", "absent", "pending_absences",
    "unconfirmed_records",
  ];
  if (!numbers.every((key) => typeof summary[key] === "number")) return null;
  if (!Array.isArray(summary.trend)) return null;
  return summary as unknown as AttendanceSummary;
}

function parseRecords(value: unknown): AttendanceRecord[] | null {
  if (!Array.isArray(value)) return null;
  const valid = value.every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const record = entry as Record<string, unknown>;
    return typeof record.event_date === "string"
      && typeof record.event_title === "string"
      && typeof record.final_status === "string"
      && typeof record.in_denominator === "boolean"
      && typeof record.attendance_credit === "boolean";
  });
  return valid ? (value as AttendanceRecord[]) : null;
}

function AttendanceHeader({ canManage }: { canManage: boolean }) {
  return <header className="page-header">
    <div>
      <p className="eyebrow">出席紀錄</p>
      <h1>我的出席</h1>
      <p>依扶輪社與期間統計本人出席率；出席率的分母與計算方式全部由資料庫依規則判定。</p>
    </div>
    {canManage && <Link className="button" href="/attendance/manage">出席管理</Link>}
  </header>;
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ clubId?: string; dateFrom?: string; dateTo?: string }>;
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
  // One call: the database picks the club and applies the default Rotary-year
  // range, so the summary and history come back with the club list rather than
  // a round trip behind it.
  const { data, error } = await supabase.rpc("get_my_attendance_page", {
    p_club_id: params.clubId ?? null,
    p_date_from: range?.dateFrom ?? null,
    p_date_to: range?.dateTo ?? null,
  });

  const projection = (data ?? {}) as Record<string, unknown>;
  const clubRows = Array.isArray(projection.clubs) ? projection.clubs : null;
  if (error || !clubRows || !clubRows.every(isAttendanceClub)) {
    return <div className="page-stack">
      <AttendanceHeader canManage={false} />
      <Notice tone="error">目前無法確認出席社別與權限，請稍後重新整理。</Notice>
    </div>;
  }

  const memberClubs = clubRows.filter((club) => club.membership_id !== null);
  const selectedClub = memberClubs.find((club) => club.club_id === projection.selected_club_id) ?? null;
  const summary = parseSummary(projection.summary);
  const records = parseRecords(projection.records);
  const dateFrom = typeof projection.date_from === "string" ? projection.date_from : null;
  const dateTo = typeof projection.date_to === "string" ? projection.date_to : null;

  return <div className="page-stack">
    <AttendanceHeader canManage={clubRows.some((club) => club.can_manage)} />

    {rangeRejected && <Notice tone="error">
      查詢期間不正確，已改用預設期間。起訖日必須是有效日期，且間隔不超過 366 天。
    </Notice>}

    {memberClubs.length > 1 && <section>
      <div className="section-heading"><h2>選擇扶輪社</h2></div>
      <div className="club-grid">
        {memberClubs.map((club) => <Link
          key={club.club_id}
          href={`/attendance?clubId=${encodeURIComponent(club.club_id)}`}
          className="club-card"
          aria-current={selectedClub?.club_id === club.club_id ? "page" : undefined}
        >
          <div><span className="club-code">{club.club_code}</span><h3>{club.club_name}</h3></div>
          <span className="card-link">{selectedClub?.club_id === club.club_id ? "目前顯示" : "查看出席 →"}</span>
        </Link>)}
      </div>
    </section>}

    {!selectedClub && <EmptyState
      title="目前沒有可查詢的出席社別"
      body="出席率只計算本人具有效社籍的扶輪社。若您只是代管社務，請改用出席管理頁。"
    />}

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

    {selectedClub && !summary && <Notice tone="error">
      目前無法載入出席統計，系統不會把權限或資料庫錯誤當成零出席。
    </Notice>}

    {summary && <section>
      <div className="section-heading">
        <div><p className="eyebrow">統計</p><h2>出席率</h2></div>
        <span>{summary.attended} / {summary.denominator} 場計入</span>
      </div>
      <div className="metric-grid">
        <div className="card">
          <span className="metric-label">出席率</span>
          <strong className="metric-value">{formatAttendanceRate(summary.attendance_rate)}</strong>
          <p>分母為計入出席且您具出席資格的活動。</p>
        </div>
        <div className="card">
          <span className="metric-label">出席與補出席</span>
          <strong className="metric-value metric-text">{summary.present + summary.makeup} 場</strong>
          <p>出席 {summary.present} 場 · 補出席 {summary.makeup} 場</p>
        </div>
        <div className="card">
          <span className="metric-label">請假與公假</span>
          <strong className="metric-value metric-text">{summary.leave + summary.official_leave} 場</strong>
          <p>請假 {summary.leave} 場 · 公假 {summary.official_leave} 場 · 免計 {summary.exempt} 場</p>
        </div>
        <div className="card">
          <span className="metric-label">缺席</span>
          <strong className="metric-value metric-text">{summary.absent} 場</strong>
          <p>{summary.unconfirmed_records > 0
            ? `其中 ${summary.unconfirmed_records} 場活動尚未結束，紀錄可能還會變動。`
            : "已結束活動的缺席紀錄。"}</p>
        </div>
      </div>

      {summary.trend.length > 0 && <div className="card">
        <div className="section-heading"><h3>逐月出席率</h3></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>月份</th><th>計入場次</th><th>出席</th><th>出席率</th></tr></thead>
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

    {selectedClub && records === null && <Notice tone="error">目前無法載入出席明細。</Notice>}

    {records !== null && records.length === 0 && selectedClub && <EmptyState
      title="這段期間沒有計入出席的活動"
      body="只有已發布或已結束、且設定為計入出席的活動才會列入統計。"
    />}

    {records !== null && records.length > 0 && <section>
      <div className="section-heading">
        <div><p className="eyebrow">明細</p><h2>出席紀錄</h2></div>
        <span>{records.length} 筆</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>日期</th><th>活動</th><th>結果</th><th>簽到方式</th><th>調整原因</th></tr>
          </thead>
          <tbody>
            {records.map((record, index) => <tr key={`${record.event_date}-${index}`}>
              <td>{formatAttendanceDate(record.event_date)}</td>
              <td>{record.event_title}</td>
              <td>
                <span className={attendanceStatusBadge(record.final_status)}>
                  {attendanceStatusLabels[record.final_status] ?? record.final_status}
                </span>
                {!record.in_denominator && <span className="badge badge-neutral">不計分母</span>}
              </td>
              <td>
                {record.raw_checked_in_at
                  ? `${checkinMethodLabels[record.raw_checkin_method ?? ""] ?? record.raw_checkin_method ?? "已簽到"} · ${formatAttendanceDateTime(record.raw_checked_in_at)}`
                  : "—"}
              </td>
              <td>{record.adjustment_reason ?? "—"}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>}
  </div>;
}

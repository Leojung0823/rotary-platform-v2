import Link from "next/link";
import { Card, EmptyState, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import {
  attendanceDateRange,
  parseAttendanceDate,
} from "@/lib/attendance/validation";
import {
  parseAttendanceClubs,
  parseAttendanceHistory,
  parseAttendanceSummary,
} from "@/lib/attendance/projections";
import {
  attendanceBadge,
  attendanceStatusLabels,
  formatAttendanceDateTime,
} from "@/lib/attendance/presentation";
import { createClient } from "@/lib/supabase/server";

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultDates() {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 180);
  return { from: isoDate(from), to: isoDate(to) };
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ clubId?: string; from?: string; to?: string }>;
}) {
  await requireIdentity();
  const query = await searchParams;
  const defaults = defaultDates();
  let dateFrom = parseAttendanceDate(query.from, defaults.from);
  let dateTo = parseAttendanceDate(query.to, defaults.to);
  try {
    attendanceDateRange(dateFrom, dateTo);
  } catch {
    dateFrom = defaults.from;
    dateTo = defaults.to;
  }

  const supabase = await createClient();
  const clubResult = await supabase.rpc("list_my_attendance_clubs");
  const allClubs = clubResult.error ? null : parseAttendanceClubs(clubResult.data);
  const memberClubs = allClubs?.filter((club) => club.membership_id !== null) ?? [];
  const selectedClub = memberClubs.find((club) => club.club_id === query.clubId) ?? memberClubs[0] ?? null;

  let unavailable = allClubs === null;
  let summary = null;
  let history = null;
  if (selectedClub) {
    const [summaryResult, historyResult] = await Promise.all([
      supabase.rpc("get_my_attendance_summary", {
        p_club_id: selectedClub.club_id,
        p_date_from: dateFrom,
        p_date_to: dateTo,
      }),
      supabase.rpc("list_my_attendance_history", {
        p_club_id: selectedClub.club_id,
        p_date_from: dateFrom,
        p_date_to: dateTo,
      }),
    ]);
    summary = summaryResult.error ? null : parseAttendanceSummary(summaryResult.data);
    history = historyResult.error ? null : parseAttendanceHistory(historyResult.data);
    unavailable ||= summary === null || history === null;
  }

  return <div className="page-stack">
    <header className="page-header">
      <div>
        <p className="eyebrow">社員本人</p>
        <h1>我的出席</h1>
        <p>每個扶輪社社籍分開計算；出席率與最終狀態由資料庫依原始簽到及有效調整產生。</p>
      </div>
      {allClubs?.some((club) => club.can_manage) && <Link className="button" href="/attendance/manage">管理出席</Link>}
    </header>

    {unavailable && <Notice tone="error">目前無法確認出席資料或權限。系統不會把權限錯誤當成空資料。</Notice>}

    {!unavailable && memberClubs.length === 0 && <EmptyState
      title="目前沒有可查看的社員社籍"
      body="只有 active 社籍可以查看新的本人出席紀錄；執行秘書等非社員 operator 不會進入社員分母。"
    />}

    {selectedClub && <>
      {memberClubs.length > 1 && <section>
        <div className="section-heading"><h2>切換扶輪社</h2><span>各社獨立統計</span></div>
        <div className="club-grid">
          {memberClubs.map((club) => <Link
            key={club.club_id}
            className="club-card"
            aria-current={club.club_id === selectedClub.club_id ? "page" : undefined}
            href={`/attendance?clubId=${encodeURIComponent(club.club_id)}&from=${dateFrom}&to=${dateTo}`}
          >
            <div><span className="club-code">{club.club_code}</span><h3>{club.club_name}</h3></div>
            <span className="card-link">{club.club_id === selectedClub.club_id ? "目前顯示" : "查看此社 →"}</span>
          </Link>)}
        </div>
      </section>}

      <Card>
        <div className="section-heading"><div><p className="eyebrow">日期範圍</p><h2>{selectedClub.club_name}</h2></div><span>最長 366 天</span></div>
        <form className="inline-form" method="get">
          <input type="hidden" name="clubId" value={selectedClub.club_id} />
          <label className="field"><span className="label">開始日期</span><input className="input" type="date" name="from" defaultValue={dateFrom} required /></label>
          <label className="field"><span className="label">結束日期</span><input className="input" type="date" name="to" defaultValue={dateTo} required /></label>
          <button className="button" type="submit">套用範圍</button>
        </form>
      </Card>

      {summary && <>
        <div className="metric-grid attendance-metrics">
          <Card><span className="metric-label">本人出席率</span><strong className="metric-value">{summary.attendance_rate ?? 0}%</strong><p>{summary.attended} / {summary.denominator} 次計入分母</p></Card>
          <Card><span className="metric-label">已出席</span><strong className="metric-value">{summary.present ?? 0}</strong></Card>
          <Card><span className="metric-label">補出席</span><strong className="metric-value">{summary.makeup ?? 0}</strong></Card>
          <Card><span className="metric-label">請假</span><strong className="metric-value">{summary.leave ?? 0}</strong></Card>
          <Card><span className="metric-label">公假</span><strong className="metric-value">{summary.official_leave ?? 0}</strong><p>V0.8 政策：不計分母</p></Card>
          <Card><span className="metric-label">缺席／免計</span><strong className="metric-value metric-text">{summary.absent ?? 0}／{summary.exempt ?? 0}</strong></Card>
        </div>
        <Card>
          <div className="section-heading"><h2>出席率趨勢</h2><span>按月</span></div>
          {summary.trend.length === 0 ? <p>此日期範圍尚無可統計活動。</p> : <div className="trend-list">
            {summary.trend.map((point) => <div className="trend-row" key={point.period}>
              <span>{point.period}</span><div className="trend-track"><span style={{ width: `${Math.min(100, point.attendance_rate)}%` }} /></div><strong>{point.attendance_rate}%</strong>
            </div>)}
          </div>}
        </Card>
      </>}

      {history && <section>
        <div className="section-heading"><div><p className="eyebrow">最終結果</p><h2>出席紀錄</h2></div><span>{history.length} 場</span></div>
        {history.length === 0 ? <EmptyState title="此範圍沒有出席活動" body="調整日期範圍，或等待活動發布並開始後再查看。" /> : <div className="table-wrap"><table>
          <thead><tr><th>活動日期</th><th>活動</th><th>最終狀態</th><th>原始簽到</th><th>人工調整</th><th>分母</th></tr></thead>
          <tbody>{history.map((row) => <tr key={row.event_id}>
            <td>{row.event_date}</td>
            <td><strong>{row.event_title}</strong></td>
            <td><span className={attendanceBadge(row.final_status)}>{attendanceStatusLabels[row.final_status] ?? row.final_status}</span></td>
            <td>{row.raw_checked_in_at ? `${row.raw_checkin_method === "qr" ? "QR" : "人工"} · ${formatAttendanceDateTime(row.raw_checked_in_at)}` : "—"}</td>
            <td>{row.adjustment_type ? <><strong>{attendanceStatusLabels[row.adjustment_type] ?? row.adjustment_type}</strong><br /><span className="hint">{row.adjustment_reason}</span></> : "—"}</td>
            <td>{row.in_denominator ? "計入" : "不計"}</td>
          </tr>)}</tbody>
        </table></div>}
      </section>}
    </>}
  </div>;
}

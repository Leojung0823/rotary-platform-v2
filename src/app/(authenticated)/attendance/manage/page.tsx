import Link from "next/link";
import { redirect } from "next/navigation";
import {
  revokeAttendanceAdjustmentAction,
  setAttendanceAdjustmentAction,
} from "@/app/attendance-actions";
import { Card, EmptyState, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import {
  parseAttendanceClubs,
  parseAttendanceRoster,
  type AttendanceRoster,
} from "@/lib/attendance/projections";
import {
  adjustmentTypeLabels,
  attendanceBadge,
  attendanceStatusLabels,
  formatAttendanceDateTime,
} from "@/lib/attendance/presentation";
import { parseAttendanceUuid } from "@/lib/attendance/validation";
import { createClient } from "@/lib/supabase/server";

type EventOption = {
  id: string;
  title: string;
  starts_at: string;
  status: string;
  counts_for_attendance: boolean;
};

function parseEvents(value: unknown): EventOption[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const events = (value as Record<string, unknown>).events;
  if (!Array.isArray(events) || !events.every((event) => event && typeof event === "object" && !Array.isArray(event)
    && typeof event.id === "string"
    && typeof event.title === "string"
    && typeof event.starts_at === "string"
    && typeof event.status === "string"
    && typeof event.counts_for_attendance === "boolean")) return null;
  return events as EventOption[];
}

const successMessages: Record<string, string> = {
  adjustment_set: "人工調整已建立，原始簽到紀錄保持不變。",
  adjustment_revoked: "人工調整已撤銷，完整歷史仍保留。",
};

const errorMessages: Record<string, string> = {
  invalid_input: "請選擇有效類型並填寫 500 字內原因。",
  forbidden: "目前帳號沒有此社出席管理權限。",
  adjustment_exists: "該社員已有有效調整；請先輸入原因撤銷，再建立新調整。",
  event_not_eligible: "只有已開始、已發布或完成且計入出席的活動可以調整。",
  not_found: "找不到可撤銷的調整紀錄。",
  unexpected: "目前無法完成操作，請稍後再試。",
};

export default async function AttendanceManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ clubId?: string; eventId?: string; q?: string; success?: string; error?: string }>;
}) {
  await requireIdentity();
  const query = await searchParams;
  const supabase = await createClient();
  const clubsResult = await supabase.rpc("list_my_attendance_clubs");
  const clubs = clubsResult.error ? null : parseAttendanceClubs(clubsResult.data);
  if (clubs === null) return <div className="page-stack"><Notice tone="error">目前無法確認出席管理權限。</Notice></div>;

  const manageableClubs = clubs.filter((club) => club.can_manage);
  if (manageableClubs.length === 0) redirect("/access-denied?reason=attendance_manage_required");
  const selectedClub = manageableClubs.find((club) => club.club_id === query.clubId) ?? manageableClubs[0];

  const eventsResult = await supabase.rpc("list_club_events", { p_club_id: selectedClub.club_id });
  const events = eventsResult.error ? null : parseEvents(eventsResult.data);
  const eligibleEvents = (events ?? []).filter((event) => event.counts_for_attendance
    && (event.status === "published" || event.status === "completed"));
  let selectedEvent = null;
  if (query.eventId) {
    try {
      const eventId = parseAttendanceUuid(query.eventId);
      selectedEvent = eligibleEvents.find((event) => event.id === eventId) ?? null;
    } catch {
      selectedEvent = null;
    }
  }

  let roster: AttendanceRoster | null = null;
  let rosterUnavailable = events === null;
  if (selectedEvent) {
    const rosterResult = await supabase.rpc("get_event_attendance_roster", {
      p_club_id: selectedClub.club_id,
      p_event_id: selectedEvent.id,
    });
    roster = rosterResult.error ? null : parseAttendanceRoster(rosterResult.data);
    rosterUnavailable ||= roster === null;
  }
  const memberQuery = query.q?.trim().toLocaleLowerCase("zh-TW") ?? "";
  const members = roster?.members.filter((member) => member.display_name.toLocaleLowerCase("zh-TW").includes(memberQuery)) ?? [];

  return <div className="page-stack">
    <header className="page-header">
      <div><p className="eyebrow">秘書管理</p><h1>出席管理</h1><p>原始 QR／人工簽到與人工調整分開保存；所有新增與撤銷都必須填寫原因並寫入 audit log。</p></div>
      <Link className="button button-secondary" href={`/attendance?clubId=${encodeURIComponent(selectedClub.club_id)}`}>查看本人出席</Link>
    </header>

    {query.success && successMessages[query.success] && <Notice tone="success">{successMessages[query.success]}</Notice>}
    {query.error && <Notice tone="error">{errorMessages[query.error] ?? errorMessages.unexpected}</Notice>}

    <Card>
      <div className="section-heading"><div><p className="eyebrow">活動篩選</p><h2>選擇社別與活動</h2></div><span>最多顯示 1,000 位社員</span></div>
      <form className="form-grid" method="get">
        <label className="field"><span className="label">扶輪社</span><select className="input" name="clubId" defaultValue={selectedClub.club_id}>
          {manageableClubs.map((club) => <option key={club.club_id} value={club.club_id}>{club.club_name}</option>)}
        </select></label>
        <label className="field"><span className="label">活動</span><select className="input" name="eventId" defaultValue={selectedEvent?.id ?? ""} required>
          <option value="" disabled>選擇活動</option>
          {eligibleEvents.map((event) => <option key={event.id} value={event.id}>{event.title} · {formatAttendanceDateTime(event.starts_at)}</option>)}
        </select></label>
        <div className="form-actions"><button className="button" type="submit">載入名冊</button></div>
      </form>
    </Card>

    {events === null && <Notice tone="error">目前無法載入活動清單。</Notice>}
    {events !== null && eligibleEvents.length === 0 && <EmptyState title="目前沒有可管理的出席活動" body="活動必須已發布或完成，並設定為計入出席。" />}
    {rosterUnavailable && <Notice tone="error">目前無法載入名冊或確認權限。</Notice>}

    {roster && selectedEvent && <>
      <section className="card">
        <div className="section-heading"><div><p className="eyebrow">目前活動</p><h2>{roster.event.title}</h2></div><span>{formatAttendanceDateTime(roster.event.starts_at)}</span></div>
        <div className="form-actions">
          <a className="button button-secondary" href={`/api/v1/clubs/${selectedClub.club_id}/attendance/export?eventId=${selectedEvent.id}`}>匯出安全 CSV</a>
        </div>
        <form className="inline-form" method="get">
          <input type="hidden" name="clubId" value={selectedClub.club_id} />
          <input type="hidden" name="eventId" value={selectedEvent.id} />
          <label className="field"><span className="label">搜尋社員</span><input className="input" name="q" defaultValue={query.q} placeholder="輸入社員姓名" /></label>
          <button className="button" type="submit">搜尋</button>
        </form>
      </section>

      <section>
        <div className="section-heading"><div><p className="eyebrow">活動出席名冊</p><h2>原始簽到與有效調整</h2></div><span>{members.length} 位</span></div>
        {members.length === 0 ? <EmptyState title="找不到社員" body="調整搜尋條件，或確認社員在活動日期具有出席資格。" /> : <div className="attendance-roster">
          {members.map((member) => <article className="card attendance-member" key={member.membership_id}>
            <div className="section-heading"><div><h2>{member.display_name}</h2><span className={attendanceBadge(member.final_status)}>{attendanceStatusLabels[member.final_status] ?? member.final_status}</span></div><span>{member.in_denominator ? "計入分母" : "不計分母"}</span></div>
            <div className="two-column">
              <div className="record-panel">
                <strong>原始簽到</strong>
                {member.raw_attendance_id ? <p>{member.raw_checkin_method === "qr" ? "QR／本人簽到" : "現場人工簽到"}<br />{member.raw_checked_in_at ? formatAttendanceDateTime(member.raw_checked_in_at) : "—"}<br /><span className="hint">{member.raw_attendance_status === "active" ? "有效" : "已撤銷，但原始歷史保留"}</span></p> : <p>尚無原始簽到</p>}
              </div>
              <div className="record-panel">
                <strong>人工調整</strong>
                {member.adjustment_id ? <p>{adjustmentTypeLabels[member.adjustment_type ?? ""] ?? member.adjustment_type}<br /><span className="hint">{member.adjustment_reason}</span></p> : <p>尚無有效調整</p>}
              </div>
            </div>
            {!member.adjustment_id && <form action={setAttendanceAdjustmentAction} className="inline-form">
              <input type="hidden" name="clubId" value={selectedClub.club_id} />
              <input type="hidden" name="eventId" value={selectedEvent.id} />
              <input type="hidden" name="membershipId" value={member.membership_id} />
              <label className="field"><span className="label">調整類型</span><select className="input" name="type" required defaultValue="leave">
                <option value="leave">請假</option><option value="official_leave">公假</option><option value="makeup">補出席</option><option value="exempt">免計</option>
              </select></label>
              <label className="field"><span className="label">異動原因</span><input className="input" name="reason" maxLength={500} required /></label>
              <button className="button" type="submit">建立調整</button>
            </form>}
            {member.adjustment_id && <form action={revokeAttendanceAdjustmentAction} className="inline-form">
              <input type="hidden" name="clubId" value={selectedClub.club_id} />
              <input type="hidden" name="eventId" value={selectedEvent.id} />
              <input type="hidden" name="adjustmentId" value={member.adjustment_id} />
              <label className="field"><span className="label">撤銷原因</span><input className="input" name="reason" maxLength={500} required /></label>
              <button className="button button-danger" type="submit">撤銷調整</button>
            </form>}
          </article>)}
        </div>}
      </section>

      <section>
        <div className="section-heading"><div><p className="eyebrow">不可刪除歷史</p><h2>調整紀錄</h2></div><span>{roster.adjustment_history.length} 筆</span></div>
        {roster.adjustment_history.length === 0 ? <Notice>尚無人工調整歷史。</Notice> : <div className="table-wrap"><table>
          <thead><tr><th>社員</th><th>類型</th><th>建立原因</th><th>建立時間</th><th>狀態／撤銷原因</th></tr></thead>
          <tbody>{roster.adjustment_history.map((item) => <tr key={item.adjustment_id}>
            <td>{item.display_name}</td><td>{adjustmentTypeLabels[item.adjustment_type] ?? item.adjustment_type}</td><td>{item.reason}</td><td>{formatAttendanceDateTime(item.created_at)}</td>
            <td>{item.revoked_at ? <>已撤銷<br /><span className="hint">{item.revocation_reason}</span></> : <span className="badge badge-success">有效</span>}</td>
          </tr>)}</tbody>
        </table></div>}
      </section>
    </>}
  </div>;
}

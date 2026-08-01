import Link from "next/link";
import { Badge, Card, EmptyState, Notice } from "@/components/ui";
import { hasPlatformAccess, requireIdentity } from "@/lib/auth";
import { parseAttendanceClubs, parseAttendanceSummary } from "@/lib/attendance/projections";
import {
  formatAnnouncementTime,
  parseAnnouncementList,
  parseManageableAnnouncements,
  parseNotificationList,
  type AnnouncementClub,
} from "@/lib/announcements/projections";
import { createClient } from "@/lib/supabase/server";

 type Club = {
  club_id: string;
  club_code: string;
  club_name: string;
  club_status: string;
  permission_level: string;
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ attendanceClubId?: string; announcementClubId?: string }>;
}) {
  const identity = await requireIdentity();
  const query = await searchParams;
  const supabase = await createClient();
  const [{ data, error }, attendanceClubsResult, announcementClubsResult, unreadResult] = await Promise.all([
    supabase.rpc("list_manageable_clubs"),
    supabase.rpc("list_my_attendance_clubs"),
    supabase.rpc("list_my_announcement_clubs"),
    supabase.rpc("get_my_unread_notification_count"),
  ]);
  const clubs = (data ?? []) as Club[];
  const attendanceClubs = attendanceClubsResult.error ? null : parseAttendanceClubs(attendanceClubsResult.data);
  const selectedAttendanceClub = attendanceClubs?.find((club) => club.club_id === query.attendanceClubId)
    ?? attendanceClubs?.[0]
    ?? null;
  const announcementClubs = announcementClubsResult.error ? null : (announcementClubsResult.data ?? []) as AnnouncementClub[];
  const selectedAnnouncementClub = announcementClubs?.find((club) => club.club_id === query.announcementClubId)
    ?? announcementClubs?.[0]
    ?? null;
  const dateTo = new Date();
  const dateFrom = new Date(dateTo);
  dateFrom.setUTCDate(dateFrom.getUTCDate() - 90);
  let attendanceSummary = null;
  if (selectedAttendanceClub) {
    const summaryResult = selectedAttendanceClub.can_manage
      ? await supabase.rpc("get_club_attendance_summary", {
        p_club_id: selectedAttendanceClub.club_id,
        p_date_from: isoDate(dateFrom),
        p_date_to: isoDate(dateTo),
      })
      : await supabase.rpc("get_my_attendance_summary", {
        p_club_id: selectedAttendanceClub.club_id,
        p_date_from: isoDate(dateFrom),
        p_date_to: isoDate(dateTo),
      });
    attendanceSummary = summaryResult.error ? null : parseAttendanceSummary(summaryResult.data);
  }
  const [announcementListResult, notificationListResult, manageableResult] = await Promise.all([
    selectedAnnouncementClub ? supabase.rpc("list_my_announcements", {
      p_club_id: selectedAnnouncementClub.club_id, p_cursor: null, p_limit: 5,
    }) : Promise.resolve({ data: { items: [] }, error: null }),
    supabase.rpc("list_my_notifications", { p_cursor: null, p_limit: 5 }),
    selectedAnnouncementClub?.can_manage ? supabase.rpc("list_manageable_announcements", {
      p_club_id: selectedAnnouncementClub.club_id, p_status: null, p_cursor: null, p_limit: 100,
    }) : Promise.resolve({ data: { items: [] }, error: null }),
  ]);
  const latestAnnouncements = announcementListResult.error ? null : parseAnnouncementList(announcementListResult.data);
  const recentNotifications = notificationListResult.error ? null : parseNotificationList(notificationListResult.data);
  const manageableAnnouncements = manageableResult.error ? null : parseManageableAnnouncements(manageableResult.data);
  const deliverySummaries = selectedAnnouncementClub?.can_manage && manageableAnnouncements
    ? await Promise.all(manageableAnnouncements.map((announcement) => supabase.rpc("get_announcement_delivery_summary", {
      p_club_id: selectedAnnouncementClub.club_id, p_announcement_id: announcement.id,
    })))
    : [];
  const failedDeliveryCount = deliverySummaries.reduce((sum, result) => {
    const value = result.error || !result.data || typeof result.data !== "object" ? 0 : Number((result.data as { failed_count?: number }).failed_count ?? 0);
    return sum + value;
  }, 0);

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">工作台</p>
          <h1>{identity.display_name}，您好</h1>
          <p>您目前可管理 {error ? "—" : clubs.length} 個扶輪社。</p>
        </div>
        <div className="form-actions">
          <Link className="button button-secondary" href="/features">
            功能總覽
          </Link>
          {hasPlatformAccess(identity) && (
            <Link className="button" href="/platform/clubs/new">
              建立扶輪社
            </Link>
          )}
        </div>
      </header>

      {attendanceClubs === null && <Notice tone="error">目前無法讀取出席統計權限。</Notice>}
      {selectedAttendanceClub && attendanceSummary && <section className="page-stack dashboard-attendance">
        <div className="section-heading">
          <div><p className="eyebrow">V0.8 出席概況</p><h2>{selectedAttendanceClub.club_name}</h2></div>
          <div className="form-actions">
            {attendanceClubs && attendanceClubs.length > 1 && <form method="get">
              <label className="sr-only" htmlFor="attendanceClubId">切換出席統計社別</label>
              <select className="input" id="attendanceClubId" name="attendanceClubId" defaultValue={selectedAttendanceClub.club_id}>
                {attendanceClubs.map((club) => <option key={club.club_id} value={club.club_id}>{club.club_name}</option>)}
              </select>
              <button className="button button-secondary" type="submit">切換</button>
            </form>}
            <Link className="button" href={selectedAttendanceClub.can_manage ? `/attendance/manage?clubId=${selectedAttendanceClub.club_id}` : `/attendance?clubId=${selectedAttendanceClub.club_id}`}>查看出席</Link>
          </div>
        </div>
        <div className="metric-grid attendance-metrics">
          <Card><span className="metric-label">本期平均出席率</span><strong className="metric-value">{attendanceSummary.average_attendance_rate ?? attendanceSummary.attendance_rate ?? 0}%</strong><p>最近 90 天</p></Card>
          <Card><span className="metric-label">待處理缺席</span><strong className="metric-value">{attendanceSummary.pending_absences}</strong></Card>
          <Card><span className="metric-label">尚未確認紀錄</span><strong className="metric-value">{attendanceSummary.unconfirmed_records}</strong></Card>
        </div>
        <Card>
          <div className="section-heading"><h2>出席率趨勢</h2><span>按月</span></div>
          {attendanceSummary.trend.length === 0 ? <p>本期尚無可統計紀錄。</p> : <div className="trend-list">
            {attendanceSummary.trend.map((point) => <div className="trend-row" key={point.period}>
              <span>{point.period}</span><div className="trend-track"><span style={{ width: `${Math.min(100, point.attendance_rate)}%` }} /></div><strong>{point.attendance_rate}%</strong>
            </div>)}
          </div>}
        </Card>
      </section>}

      {selectedAnnouncementClub && <section className="page-stack dashboard-attendance">
        <div className="section-heading"><div><p className="eyebrow">V0.9 公告與通知</p><h2>{selectedAnnouncementClub.club_name}</h2></div><div className="form-actions">{announcementClubs && announcementClubs.length > 1 && <form method="get"><label className="sr-only" htmlFor="announcementClubId">切換公告社別</label><select className="input" id="announcementClubId" name="announcementClubId" defaultValue={selectedAnnouncementClub.club_id}>{announcementClubs.map((club) => <option key={club.club_id} value={club.club_id}>{club.club_name}</option>)}</select><button className="button button-secondary" type="submit">切換</button></form>}<Link className="button" href={`/announcements?clubId=${selectedAnnouncementClub.club_id}`}>查看公告</Link></div></div>
        <div className="metric-grid attendance-metrics"><Card><span className="metric-label">未讀通知</span><strong className="metric-value">{unreadResult.error ? "—" : Number(unreadResult.data ?? 0)}</strong></Card>{selectedAnnouncementClub.can_manage && <><Card><span className="metric-label">草稿</span><strong className="metric-value">{manageableAnnouncements?.filter((item) => item.status === "draft").length ?? "—"}</strong></Card><Card><span className="metric-label">已排程</span><strong className="metric-value">{manageableAnnouncements?.filter((item) => item.status === "scheduled").length ?? "—"}</strong></Card><Card><span className="metric-label">失敗送達</span><strong className="metric-value">{failedDeliveryCount}</strong></Card></>}</div>
        <div className="two-column"><Card><div className="section-heading"><h2>最新公告</h2><span>{latestAnnouncements?.length ?? 0} 筆</span></div>{latestAnnouncements?.length ? <ul className="activity-list">{latestAnnouncements.map((item) => <li key={item.id}><Link href={`/announcements/${item.id}?clubId=${item.club_id}`}>{item.title}</Link><small>{formatAnnouncementTime(item.published_at)}</small></li>)}</ul> : <p>目前沒有可讀公告。</p>}</Card><Card><div className="section-heading"><h2>最近通知</h2><Link href="/notifications">全部</Link></div>{recentNotifications?.length ? <ul className="activity-list">{recentNotifications.map((item) => <li key={item.id}><Link href={item.action_path}>{item.title}</Link><small>{item.read_at ? "已讀" : "未讀"}</small></li>)}</ul> : <p>目前沒有通知。</p>}</Card></div>
        {selectedAnnouncementClub.can_manage && <Card><div className="section-heading"><h2>即將發布</h2><Link href={`/announcements/manage?clubId=${selectedAnnouncementClub.club_id}&status=scheduled`}>管理</Link></div>{manageableAnnouncements?.filter((item) => item.status === "scheduled").slice(0, 5).map((item) => <p key={item.id}><Link href={`/announcements/manage/${item.id}?clubId=${selectedAnnouncementClub.club_id}`}>{item.title}</Link> · {formatAnnouncementTime(item.publish_at)}</p>) || <p>目前沒有排程公告。</p>}</Card>}
      </section>}

      <Card>
        <div className="section-heading">
          <div>
            <p className="eyebrow">下一階段</p>
            <h2>V0.8 出席管理、請假與出席統計</h2>
          </div>
          <Badge tone="warning">開發中</Badge>
        </div>
        <p>在既有活動與原始簽到之上，新增本人出席率、社內名冊、請假／公假／補出席／免計、歷史保留與安全 CSV。</p>
        <Link className="card-link" href="/features">查看完整功能地圖 →</Link>
      </Card>

      {error ? (
        <Notice tone="error">目前無法讀取可管理的扶輪社，請稍後重新整理。</Notice>
      ) : (
        <>
          <div className="metric-grid">
            <Card>
              <span className="metric-label">可管理扶輪社</span>
              <strong className="metric-value">{clubs.length}</strong>
            </Card>
            <Card>
              <span className="metric-label">平台角色</span>
              <strong className="metric-value metric-text">
                {hasPlatformAccess(identity) ? "平台管理員" : "執行秘書"}
              </strong>
            </Card>
          </div>

          <section>
            <div className="section-heading">
              <h2>我的扶輪社</h2>
            </div>
            {clubs.length === 0 ? (
              <EmptyState title="尚無可管理的扶輪社" body="接受扶輪社邀請後，扶輪社會出現在這裡。" />
            ) : (
              <div className="club-grid">
                {clubs.map((club) => {
                  const canManageIdentity =
                    club.permission_level === "platform_admin" || club.permission_level === "club_manager";
                  return (
                    <Link
                      key={club.club_id}
                      href={canManageIdentity ? `/clubs/${club.club_id}/identity` : `/club/${club.club_id}`}
                      className="club-card"
                    >
                      <div>
                        <span className="club-code">{club.club_code}</span>
                        <h3>{club.club_name}</h3>
                      </div>
                      <Badge tone={club.club_status === "active" ? "success" : "warning"}>
                        {club.club_status === "active" ? "已啟用" : "建置中"}
                      </Badge>
                      <span className="card-link">
                        {canManageIdentity ? "開啟身份管理 →" : "進入扶輪社首頁 →"}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

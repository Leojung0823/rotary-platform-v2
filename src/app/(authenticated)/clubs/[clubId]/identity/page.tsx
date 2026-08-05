import Link from "next/link";
import { Card, Notice } from "@/components/ui";
import { parseMemberClubs } from "@/lib/member-experience";
import { createClient } from "@/lib/supabase/server";

type Dashboard = { member_total: number; line_bound: number; pending_invitations: number; recent_members: Array<{ display_name: string; membership_status: string; created_at: string }> };

export default async function ManagementHomePage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  const supabase = await createClient();
  const clubsResult = await supabase.rpc("list_my_member_clubs");
  const clubs = clubsResult.error ? null : parseMemberClubs(clubsResult.data);
  const club = clubs?.find((item) => item.club_id === clubId && item.can_manage);
  if (!club) return <Notice tone="error">您無法使用這個扶輪社的社務管理功能。</Notice>;
  const dashboardResult = await supabase.rpc("get_identity_dashboard", { p_club_id: clubId });
  if (dashboardResult.error || !dashboardResult.data) return <Notice tone="error">管理首頁暫時無法載入，請重新整理；若問題持續，請聯絡平台管理員。</Notice>;
  const dashboard = dashboardResult.data as Dashboard;
  return <div className="page-stack"><header className="page-header"><div><h1>管理首頁</h1><p>{club.club_name}</p></div><Link className="button" href={`/clubs/${clubId}/members/new`}>新增社員</Link></header><div className="metric-grid"><Card><span className="metric-label">社員</span><strong className="metric-value">{dashboard.member_total}</strong></Card><Card><span className="metric-label">待接受邀請</span><strong className="metric-value">{dashboard.pending_invitations}</strong></Card><Card><span className="metric-label">已連結 LINE</span><strong className="metric-value">{dashboard.line_bound}</strong></Card></div><section><div className="section-heading"><h2>常用管理功能</h2></div><div className="quick-grid"><Link href={`/clubs/${clubId}/events`}>活動管理</Link><Link href={`/clubs/${clubId}/attendance`}>報名與簽到</Link><Link href={`/clubs/${clubId}/members`}>社員管理</Link><Link href={`/clubs/${clubId}/announcements`}>公告管理</Link></div></section></div>;
}

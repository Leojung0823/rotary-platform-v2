import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ClubAdminNav } from "@/components/club-admin-nav";
import { Card, Notice } from "@/components/ui";

type Dashboard = { member_total: number; line_bound: number; line_unbound: number; oa_joined: number; oa_not_joined: number; pending_invitations: number; recent_logins: { display_name: string; provider_key: string; created_at: string }[]; recent_members: { display_name: string; membership_status: string; created_at: string }[] };

export default async function IdentityDashboardPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params; const supabase = await createClient();
  const [statusResult, dashboardResult] = await Promise.all([supabase.rpc("get_club_provisioning_status", { p_club_id: clubId }), supabase.rpc("get_identity_dashboard", { p_club_id: clubId })]);
  if (statusResult.error || dashboardResult.error || !statusResult.data || !dashboardResult.data) return <Notice tone="error">您沒有查看身份管理系統的權限。</Notice>;
  const club = statusResult.data as { club_name: string; club_code: string }; const dashboard = dashboardResult.data as Dashboard;
  const metrics = [["社員總數", dashboard.member_total], ["已綁定 LINE", dashboard.line_bound], ["未綁定 LINE", dashboard.line_unbound], ["已加入 OA", dashboard.oa_joined], ["未加入 OA", dashboard.oa_not_joined], ["待接受邀請", dashboard.pending_invitations]];
  return <div className="page-stack"><header className="page-header"><div><p className="eyebrow">{club.club_code} · IDENTITY & ADMIN</p><h1>{club.club_name}</h1><p>Invitation First、LINE First 的身份管理中樞。</p></div><Link className="button" href={`/clubs/${clubId}/members/new`}>＋ 新增社員</Link></header><ClubAdminNav clubId={clubId}/><div className="metric-grid">{metrics.map(([label, value]) => <Card key={String(label)}><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong></Card>)}</div><div className="two-column"><Card><h2>最近登入</h2>{dashboard.recent_logins.length ? <ul className="activity-list">{dashboard.recent_logins.map((item, index) => <li key={`${item.created_at}-${index}`}><span>{item.display_name}<small>{item.provider_key === "line_mock" ? "LINE Mock" : item.provider_key}</small></span><small>{new Intl.DateTimeFormat("zh-TW", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.created_at))}</small></li>)}</ul> : <p>尚無登入紀錄。</p>}</Card><Card><h2>最近新增社員</h2>{dashboard.recent_members.length ? <ul className="activity-list">{dashboard.recent_members.map((item, index) => <li key={`${item.created_at}-${index}`}><span>{item.display_name}<small>{item.membership_status}</small></span><small>{new Intl.DateTimeFormat("zh-TW", { dateStyle: "short" }).format(new Date(item.created_at))}</small></li>)}</ul> : <p>尚無社員。</p>}</Card></div></div>;
}

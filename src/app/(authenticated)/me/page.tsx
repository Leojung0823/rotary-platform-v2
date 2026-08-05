import Link from "next/link";
import { AvatarPhoto } from "@/components/avatar-photo";
import { avatarPublicUrl } from "@/lib/avatar";
import { hasPlatformAccess, requireIdentity } from "@/lib/auth";
import { parseMemberClubs, roleLabels } from "@/lib/member-experience";
import { createClient } from "@/lib/supabase/server";

type Center = { profile: { display_name: string; avatar_url: string | null } };

export default async function MyPage() {
  const [identity, supabase] = await Promise.all([requireIdentity(), createClient()]);
  const [centerResult, clubsResult] = await Promise.all([supabase.rpc("get_my_identity_center"), supabase.rpc("list_my_member_clubs")]);
  const center = centerResult.data as Center | null;
  const clubs = clubsResult.error ? [] : parseMemberClubs(clubsResult.data) ?? [];
  const manageable = clubs.filter((club) => club.can_manage);
  const avatarUrl = avatarPublicUrl(center?.profile.avatar_url);
  return <div className="page-stack narrow"><header className="my-profile-header"><div className="avatar profile-avatar">{avatarUrl ? <AvatarPhoto src={avatarUrl} /> : identity.display_name.slice(0, 1)}</div><div><h1>{center?.profile.display_name ?? identity.display_name}</h1>{clubs.map((club) => <p key={club.club_id}>{club.club_name}｜{roleLabels[club.role_key] ?? "社員"}</p>)}</div></header>
    <nav className="settings-menu" aria-label="我的功能"><Link href="/me/profile"><span><strong>修改我的資料</strong><small>姓名、手機、Email、生日與照片</small></span><span aria-hidden="true">›</span></Link><Link href="/events?filter=registered"><span><strong>我的活動</strong><small>查看已報名與近期活動</small></span><span aria-hidden="true">›</span></Link><Link href="/me/privacy"><span><strong>聯絡資料顯示設定</strong><small>決定同社社員可看到哪些資料</small></span><span aria-hidden="true">›</span></Link><Link href="/me/notifications"><span><strong>通知設定</strong><small>LINE、Email 與社內公告通知</small></span><span aria-hidden="true">›</span></Link><Link href="/me/security"><span><strong>帳號與登入安全</strong><small>登入方式、裝置與最近登入</small></span><span aria-hidden="true">›</span></Link><Link href="/login-help"><span><strong>登入協助</strong><small>忘記密碼或登入遇到問題</small></span><span aria-hidden="true">›</span></Link></nav>
    {(manageable.length > 0 || hasPlatformAccess(identity)) && <section className="management-entry"><h2>管理功能</h2>{manageable.map((club) => <Link className="button button-secondary" key={club.club_id} href={`/clubs/${club.club_id}/identity`}>進入 {club.club_name} 社務管理</Link>)}{hasPlatformAccess(identity) && <Link className="button button-secondary" href="/platform/clubs">進入平台管理後台</Link>}</section>}
    <form action="/api/auth/line/logout?redirect=1" method="post"><button className="button button-secondary button-full" type="submit">登出</button></form>
  </div>;
}

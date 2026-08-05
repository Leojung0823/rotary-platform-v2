import Link from "next/link";
import { AvatarPhoto } from "@/components/avatar-photo";
import { ClubSwitcher } from "@/components/club-switcher";
import { EmptyState, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { avatarPublicUrl } from "@/lib/avatar";
import { parseMemberClubs } from "@/lib/member-experience";
import { directoryRoleLabel, parseDirectoryMembers } from "@/lib/members/directory";
import { createClient } from "@/lib/supabase/server";

export default async function MemberDirectoryPage({ searchParams }: { searchParams: Promise<{ clubId?: string; q?: string }> }) {
  await requireIdentity(); const query = await searchParams; const supabase = await createClient();
  const clubsResult = await supabase.rpc("list_my_member_clubs");
  const clubs = clubsResult.error ? null : parseMemberClubs(clubsResult.data);
  if (!clubs) return <div className="page-stack"><h1>社員</h1><Notice tone="error">社員名冊暫時無法載入，請重新整理。</Notice></div>;
  if (clubs.length === 0) return <div className="page-stack"><h1>社員</h1><EmptyState title="目前沒有可查看的名冊" body="加入扶輪社後，即可查找同社社員。" /></div>;
  const selectedClub = clubs.find((club) => club.club_id === query.clubId) ?? clubs[0];
  const search = query.q?.trim().slice(0, 80) || null;
  const result = await supabase.rpc("list_club_member_directory", { p_club_id: selectedClub.club_id, p_query: search });
  const members = result.error ? null : parseDirectoryMembers(result.data);

  return <div className="page-stack"><header className="page-header"><div><h1>社員</h1><p>搜尋同社社員，並依本人設定的公開範圍聯絡。</p></div></header>
    <ClubSwitcher clubs={clubs} selectedClubId={selectedClub.club_id} />
    <form className="directory-search" action="/directory"><input type="hidden" name="clubId" value={selectedClub.club_id} /><label className="field"><span className="label">搜尋社員姓名</span><input className="input directory-search-input" type="search" name="q" defaultValue={query.q ?? ""} maxLength={80} placeholder="輸入姓名" /></label><button className="button" type="submit">搜尋</button></form>
    {!members && <Notice tone="error">社員名冊暫時無法載入，請重新整理；若問題持續，請聯絡扶輪社秘書。</Notice>}
    {members?.length === 0 && <EmptyState title="找不到社員" body="請確認姓名，或清除搜尋條件後再試一次。" />}
    <div className="directory-grid">{members?.map((member) => { const avatarUrl = avatarPublicUrl(member.avatar_url); return <article className="directory-card" key={member.membership_id}><div className="directory-person"><div className="avatar directory-avatar">{avatarUrl ? <AvatarPhoto src={avatarUrl} /> : member.display_name.slice(0, 1)}</div><div><span>{directoryRoleLabel(member.role_key)}{member.is_self ? "｜我" : ""}</span><h2>{member.display_name}</h2></div></div><div className="contact-actions">{member.phone && <a className="button" href={`tel:${member.phone}`}>撥打電話</a>}{member.email && <a className="button button-secondary" href={`mailto:${member.email}`}>寄送 Email</a>}{!member.phone && !member.email && <span className="subtle">聯絡資料未公開</span>}</div><Link className="text-action" href={`/directory/${member.membership_id}?clubId=${encodeURIComponent(selectedClub.club_id)}`}>查看社員資料</Link></article>; })}</div>
  </div>;
}

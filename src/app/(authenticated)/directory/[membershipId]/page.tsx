import Link from "next/link";
import { notFound } from "next/navigation";
import { AvatarPhoto } from "@/components/avatar-photo";
import { Card, Notice } from "@/components/ui";
import { avatarPublicUrl } from "@/lib/avatar";
import { directoryRoleLabel, parseDirectoryMember, parseDirectoryUuid } from "@/lib/members/directory";
import { createClient } from "@/lib/supabase/server";

export default async function DirectoryMemberPage({ params, searchParams }: { params: Promise<{ membershipId: string }>; searchParams: Promise<{ clubId?: string }> }) {
  const [route, query, supabase] = await Promise.all([params, searchParams, createClient()]);
  let membershipId: string; let clubId: string;
  try { membershipId = parseDirectoryUuid(route.membershipId); clubId = parseDirectoryUuid(query.clubId); } catch { notFound(); }
  const { data, error } = await supabase.rpc("get_club_member_directory_profile", { p_club_id: clubId, p_membership_id: membershipId });
  if (error) return <div className="page-stack narrow"><Notice tone="error">目前無法查看這位社員，請返回名冊後重試。</Notice></div>;
  const member = parseDirectoryMember(data); if (!member) notFound();
  const avatarUrl = avatarPublicUrl(member.avatar_url);
  return <div className="page-stack narrow"><Link className="back-link" href={`/directory?clubId=${encodeURIComponent(clubId)}`}>← 返回社員名冊</Link><header className="profile-heading"><div className="avatar profile-avatar">{avatarUrl ? <AvatarPhoto src={avatarUrl} /> : member.display_name.slice(0, 1)}</div><div><p className="selected-club-name">{directoryRoleLabel(member.role_key)}{member.is_self ? "｜我" : ""}</p><h1>{member.display_name}</h1></div></header>
    <Card><h2>聯絡資料</h2><div className="profile-contact-list">{member.phone ? <div><span>手機</span><strong>{member.phone}</strong><a className="button" href={`tel:${member.phone}`}>撥打電話</a></div> : <div><span>手機</span><strong>未公開</strong></div>}{member.email ? <div><span>Email</span><strong>{member.email}</strong><a className="button button-secondary" href={`mailto:${member.email}`}>寄送 Email</a></div> : <div><span>Email</span><strong>未公開</strong></div>}<div><span>出生年份</span><strong>{member.birth_year ?? "未公開"}</strong></div></div></Card>
    {member.is_self && <Link className="button" href="/me/profile">修改我的資料</Link>}
  </div>;
}

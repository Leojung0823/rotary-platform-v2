import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Notice } from "@/components/ui";
import {
  directoryRoleLabel,
  parseDirectoryMember,
  parseDirectoryUuid,
} from "@/lib/members/directory";
import { createClient } from "@/lib/supabase/server";

export default async function DirectoryMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ membershipId: string }>;
  searchParams: Promise<{ clubId?: string }>;
}) {
  const route = await params;
  const query = await searchParams;

  let membershipId: string;
  let clubId: string;
  try {
    membershipId = parseDirectoryUuid(route.membershipId);
    clubId = parseDirectoryUuid(query.clubId);
  } catch {
    notFound();
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_club_member_directory_profile", {
    p_club_id: clubId,
    p_membership_id: membershipId,
  });

  if (error) {
    return <Notice tone="error">目前無法查看這位社員，或您已不具備同社有效社籍。</Notice>;
  }

  const member = parseDirectoryMember(data);
  if (!member) notFound();

  return <div className="page-stack narrow">
    <header className="page-header">
      <div>
        <Link className="back-link" href={`/directory?clubId=${encodeURIComponent(clubId)}`}>← 返回社員名冊</Link>
        <p className="eyebrow">社員資料</p>
        <h1>{member.display_name}</h1>
        <div className="status-pair">
          <Badge tone="neutral">{directoryRoleLabel(member.role_key)}</Badge>
          {member.is_self && <Badge tone="success">這是我的資料</Badge>}
        </div>
      </div>
      {member.is_self && <Link className="button" href="/me">編輯我的資料</Link>}
    </header>

    <Card>
      <h2>同社可見資料</h2>
      <p>聯絡資料與出生年份由社員本人在會員中心決定是否向同社社員公開。</p>
      <ul className="activity-list">
        <li><span>Email</span><strong>{member.email ?? "未公開"}</strong></li>
        <li><span>手機</span><strong>{member.phone ?? "未公開"}</strong></li>
        <li><span>出生年份</span><strong>{member.birth_year ?? "未公開"}</strong></li>
      </ul>
    </Card>

    <Notice>
      社員名冊不顯示 Auth ID、帳號 ID、LINE subject、登入紀錄、完整生日或其他管理欄位。
    </Notice>
  </div>;
}

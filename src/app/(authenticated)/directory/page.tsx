import Link from "next/link";
import { DirectoryAvatar } from "@/components/directory-avatar";
import { EmptyState, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import {
  directoryRoleLabel,
  parseDirectoryClubs,
  parseDirectoryMembers,
} from "@/lib/members/directory";
import { createClient } from "@/lib/supabase/server";

export default async function MemberDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ clubId?: string; q?: string }>;
}) {
  await requireIdentity();
  const query = await searchParams;
  const supabase = await createClient();
  const clubsResult = await supabase.rpc("list_my_directory_clubs");

  if (clubsResult.error) {
    return <Notice tone="error">目前無法載入您可查看的社員名冊。</Notice>;
  }

  const clubs = parseDirectoryClubs(clubsResult.data);
  if (clubs.length === 0) {
    return <div className="page-stack">
      <header className="page-header"><div><p className="eyebrow">社員與身份</p><h1>社員名冊</h1></div></header>
      <EmptyState title="目前沒有可查看的名冊" body="只有有效社籍的社員能查看同社的有效社員名冊。" />
    </div>;
  }

  const selectedClub = clubs.find((club) => club.club_id === query.clubId) ?? clubs[0];
  const search = query.q?.trim().slice(0, 80) || null;
  const membersResult = await supabase.rpc("list_club_member_directory", {
    p_club_id: selectedClub.club_id,
    p_query: search,
  });

  if (membersResult.error) {
    return <Notice tone="error">目前無法讀取這個扶輪社的社員名冊。</Notice>;
  }

  const members = parseDirectoryMembers(membersResult.data);

  return <div className="page-stack">
    <header className="page-header">
      <div>
        <p className="eyebrow">社員與身份</p>
        <h1>社員名冊</h1>
        <p>只顯示同社有效社員；Email、手機與出生年份依每位社員的隱私設定公開。</p>
      </div>
      <Link className="button button-secondary" href="/me">我的資料與隱私</Link>
    </header>

    <form className="inline-form" action="/directory">
      <label className="field">
        <span className="label">扶輪社</span>
        <select className="input" name="clubId" defaultValue={selectedClub.club_id}>
          {clubs.map((club) => <option key={club.club_id} value={club.club_id}>{club.club_name}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="label">搜尋社員姓名</span>
        <input className="input" name="q" defaultValue={query.q ?? ""} maxLength={80} placeholder="輸入姓名" />
      </label>
      <button className="button" type="submit">搜尋</button>
    </form>

    <section>
      <div className="section-heading">
        <div><p className="eyebrow">{selectedClub.club_code}</p><h2>{selectedClub.club_name}</h2></div>
        <span>{members.length} 位社員</span>
      </div>

      {members.length === 0
        ? <EmptyState title="找不到社員" body="請調整姓名搜尋條件。" />
        : <div className="directory-grid">
          {members.map((member) => <Link
            className="directory-card"
            key={member.membership_id}
            href={`/directory/${member.membership_id}?clubId=${encodeURIComponent(selectedClub.club_id)}`}
          >
            <DirectoryAvatar avatarUrl={member.avatar_url} displayName={member.display_name} />
            <div className="directory-card-body">
              <div className="directory-card-name">
                <strong>{member.display_name}</strong>
                <span className="directory-role-badge">{directoryRoleLabel(member.role_key)}{member.is_self ? " · 我" : ""}</span>
              </div>
              <div className="directory-card-meta">{member.email ?? member.phone ?? "聯絡資料未公開"}</div>
            </div>
            <span className="directory-chevron" aria-hidden="true">›</span>
          </Link>)}
        </div>}
    </section>
  </div>;
}

import Link from "next/link";
import { ClubAdminNav } from "@/components/club-admin-nav";
import { Badge, EmptyState, Input, Notice } from "@/components/ui";
import { requireClubPermission } from "@/lib/club-permissions.server";
import { createClient } from "@/lib/supabase/server";
import type { MemberRow } from "../page";

type ArchivedMemberRow = MemberRow & { archived_at: string | null };

const membershipLabel: Record<string, string> = { disabled: "停用", ended: "已結束" };

const archivedAtFormatter = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Taipei",
});

export default async function ArchivedMembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { clubId } = await params;
  const query = await searchParams;
  await requireClubPermission(clubId, "member.manage");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_club_archived_members", {
    p_club_id: clubId,
    p_query: query.q || null,
  });
  if (error) return <Notice tone="error">您沒有查看社員的權限。</Notice>;
  const members = (data ?? []) as ArchivedMemberRow[];

  return <div className="page-stack">
    <header className="page-header">
      <div>
        <p className="eyebrow">會員管理</p>
        <h1>封存社員</h1>
        <p>已停用或已結束社籍的社友，最近封存的排在最前面。</p>
      </div>
      <Link className="button button-secondary" href={`/clubs/${clubId}/members?mode=management`} prefetch={false}>← 回到社員</Link>
    </header>

    <ClubAdminNav clubId={clubId} />

    <form className="inline-form">
      <input type="hidden" name="mode" value="management" />
      <Input name="q" defaultValue={query.q} placeholder="搜尋姓名、手機或 Email" />
      <button className="button" type="submit">搜尋</button>
    </form>

    {members.length === 0
      ? <EmptyState title="沒有封存的社員" body="停用社友後，他們會移到這一頁，不再出現在社員名單。" />
      : <div className="table-wrap">
        <table>
          <thead><tr><th>社員</th><th>聯絡方式</th><th>社籍</th><th>封存時間</th><th></th></tr></thead>
          <tbody>
            {members.map((member) => <tr key={member.membership_id}>
              <td><strong>{member.display_name}</strong></td>
              <td>{member.phone ?? member.email ?? "—"}</td>
              <td>
                <Badge tone="warning">
                  {membershipLabel[member.membership_status] ?? member.membership_status}
                </Badge>
              </td>
              {/* Rows archived before this page existed were backfilled from the
                  audit trail; one with no record at all says so rather than
                  showing a misleading date. */}
              <td>{member.archived_at
                ? archivedAtFormatter.format(new Date(member.archived_at))
                : "時間不明"}</td>
              <td><Link href={`/clubs/${clubId}/members/${member.membership_id}?mode=management`} prefetch={false}>管理 →</Link></td>
            </tr>)}
          </tbody>
        </table>
      </div>}
  </div>;
}

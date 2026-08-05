import { ClubSwitcher } from "@/components/club-switcher";
import { MessageBoard } from "@/components/message-board/message-board";
import { EmptyState, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { parseMemberClubs } from "@/lib/member-experience";
import { createClient } from "@/lib/supabase/server";

export default async function BoardPage({ searchParams }: { searchParams: Promise<{ clubId?: string }> }) {
  await requireIdentity(); const query = await searchParams; const supabase = await createClient(); const result = await supabase.rpc("list_my_member_clubs"); const clubs = result.error ? null : parseMemberClubs(result.data);
  if (!clubs) return <div className="page-stack"><h1>留言板</h1><Notice tone="error">留言板暫時無法載入，請重新整理。</Notice></div>;
  if (clubs.length === 0) return <div className="page-stack"><h1>留言板</h1><EmptyState title="目前沒有留言板" body="加入扶輪社後即可使用社內留言板。" /></div>;
  const selectedClub = clubs.find((club) => club.club_id === query.clubId) ?? clubs[0];
  return <div className="page-stack"><header className="page-header"><div><h1>留言板</h1><p>與同社社員分享近況與交流。</p></div></header><ClubSwitcher clubs={clubs} selectedClubId={selectedClub.club_id} /><MessageBoard clubId={selectedClub.club_id} /></div>;
}

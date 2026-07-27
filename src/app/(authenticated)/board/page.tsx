import Link from "next/link";
import { MessageBoard } from "@/components/message-board/message-board";
import { requireIdentity } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type BoardClub = {
  club_id: string;
  club_code: string;
  club_name: string;
};

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ clubId?: string }>;
}) {
  await requireIdentity();
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_my_board_clubs");
  const clubs = (data ?? []) as BoardClub[];
  const requested = (await searchParams).clubId;
  const selectedClub = clubs.find((club) => club.club_id === requested) ?? clubs[0] ?? null;

  return <div className="page-stack">
    <header className="page-header">
      <div>
        <p className="eyebrow">社員交流</p>
        <h1>留言板</h1>
        <p>每個扶輪社的留言彼此隔離，僅該社有效社員可以查看與發表。</p>
      </div>
    </header>

    {clubs.length > 1 && <section>
      <div className="section-heading"><h2>選擇扶輪社</h2></div>
      <div className="club-grid">
        {clubs.map((club) => <Link
          key={club.club_id}
          href={`/board?clubId=${encodeURIComponent(club.club_id)}`}
          className="club-card"
          aria-current={selectedClub?.club_id === club.club_id ? "page" : undefined}
        >
          <div><span className="club-code">{club.club_code}</span><h3>{club.club_name}</h3></div>
          <span className="card-link">{selectedClub?.club_id === club.club_id ? "目前顯示" : "開啟留言板 →"}</span>
        </Link>)}
      </div>
    </section>}

    {!selectedClub
      ? <div className="empty-state"><h2>目前沒有可使用的社內留言板</h2><p>只有具有效社員身分的扶輪社會顯示在這裡。</p></div>
      : <>
        <section className="section-heading">
          <div><p className="eyebrow">目前社別</p><h2>{selectedClub.club_name}</h2></div>
        </section>
        <MessageBoard clubId={selectedClub.club_id} />
      </>}
  </div>;
}

import Link from "next/link";
import { MessageBoard } from "@/components/message-board/message-board";
import { requireIdentity } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type BoardClub = {
  club_id: string;
  club_code: string;
  club_name: string;
};

function isBoardClub(value: unknown): value is BoardClub {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const club = value as Record<string, unknown>;
  return typeof club.club_id === "string"
    && typeof club.club_code === "string"
    && typeof club.club_name === "string";
}

function BoardHeader() {
  return <header className="page-header">
    <div>
      <p className="eyebrow">社員交流</p>
      <h1>留言板</h1>
      <p>每個扶輪社的留言彼此隔離，僅該社有效社員可以查看與發表。</p>
    </div>
  </header>;
}

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ clubId?: string }>;
}) {
  await requireIdentity();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_board_clubs");
  const rows = data ?? [];

  if (error || !Array.isArray(rows) || !rows.every(isBoardClub)) {
    return <div className="page-stack">
      <BoardHeader />
      <div className="empty-state" role="alert">
        <h2>無法載入留言板社別</h2>
        <p>目前無法確認您的社籍與留言板權限，請稍後重新整理。系統不會把權限或資料庫錯誤當成空資料。</p>
      </div>
    </div>;
  }

  const clubs = rows;
  const requested = (await searchParams).clubId;
  const selectedClub = clubs.find((club) => club.club_id === requested) ?? clubs[0] ?? null;

  // Offered only to someone who may manage members: addressing a tag means
  // choosing which members see the post. The RPC refuses anyone else, so an
  // error simply leaves the composer open to the whole club.
  let audienceTags: { tag_id: string; tag_name: string; member_count: number }[] = [];
  if (selectedClub) {
    const tagsResult = await supabase.rpc("list_club_member_tags", { p_club_id: selectedClub.club_id });
    if (!tagsResult.error) {
      audienceTags = ((tagsResult.data as { tags?: typeof audienceTags } | null)?.tags ?? []);
    }
  }

  return <div className="page-stack">
    <BoardHeader />

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
      ? <div className="empty-state"><h2>目前沒有可使用的社內留言板</h2><p>只有啟用中的扶輪社與有效社員身分會顯示在這裡。</p></div>
      : <>
        <section className="section-heading">
          <div><p className="eyebrow">目前社別</p><h2>{selectedClub.club_name}</h2></div>
        </section>
        <MessageBoard clubId={selectedClub.club_id} audienceTags={audienceTags} />
      </>}
  </div>;
}

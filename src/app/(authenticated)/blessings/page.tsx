import Link from "next/link";
import { notFound } from "next/navigation";
import { BlessingWall } from "@/components/blessing-iou/blessing-wall";
import { Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { parseBlessingIouClubs } from "@/lib/blessing-iou/contracts";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { createClient } from "@/lib/supabase/server";

function BlessingHeader() {
  return <header className="page-header">
    <div>
      <p className="eyebrow">社員交流</p>
      <h1>祝福 IOU</h1>
      <p>把祝福分享給本社社員；也可以留下希望捐贈的金額。</p>
    </div>
  </header>;
}

export default async function BlessingsPage({
  searchParams,
}: {
  searchParams: Promise<{ clubId?: string }>;
}) {
  const [identity, query] = await Promise.all([requireIdentity(), searchParams]);
  const evaluation = await evaluateCurrentFeatureFlag({
    key: "blessing_iou_v1",
    subjectUuid: identity.id,
  });
  if (!evaluation.enabled) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_blessing_iou_clubs");
  let clubs;
  try {
    clubs = error ? null : parseBlessingIouClubs(data ?? []);
  } catch {
    clubs = null;
  }

  if (!clubs) {
    return <div className="page-stack">
      <BlessingHeader />
      <Notice tone="error">目前無法確認您的社籍與祝福牆權限，請稍後重新整理。</Notice>
    </div>;
  }

  const selectedClub = clubs.find((club) => club.clubId === query.clubId) ?? clubs[0] ?? null;

  return <div className="page-stack">
    <BlessingHeader />

    {clubs.length > 1 && <section>
      <div className="section-heading"><h2>選擇扶輪社</h2></div>
      <div className="club-grid">
        {clubs.map((club) => <Link
          key={club.clubId}
          href={`/blessings?clubId=${encodeURIComponent(club.clubId)}&mode=member`}
          className="club-card"
          aria-current={selectedClub?.clubId === club.clubId ? "page" : undefined}
        >
          <div><span className="club-code">{club.clubCode}</span><h3>{club.clubName}</h3></div>
          <span className="card-link">{selectedClub?.clubId === club.clubId ? "目前顯示" : "開啟祝福牆 →"}</span>
        </Link>)}
      </div>
    </section>}

    {!selectedClub
      ? <div className="empty-state"><h2>目前沒有可使用的祝福牆</h2><p>只有啟用中的扶輪社與有效社員身分可以使用。</p></div>
      : <>
        <section className="section-heading">
          <div><p className="eyebrow">目前社別</p><h2>{selectedClub.clubName}</h2></div>
          {selectedClub.canManage && <Link
            className="button button-secondary"
            href={`/clubs/${encodeURIComponent(selectedClub.clubId)}/blessing-iou?mode=management`}
          >幹部管理</Link>}
        </section>
        <Notice>
          祝福內容會讓本社社員看見。{selectedClub.allowPublicAmounts
            ? "捐款金額為選填；填入金額後，可以用下方的「隱藏我的金額」自行決定是否公開。"
            : "捐款金額不公開，只有本人與授權幹部看得到。"}
        </Notice>
        <BlessingWall
          clubId={selectedClub.clubId}
          allowPublicAmounts={selectedClub.allowPublicAmounts}
        />
      </>}
  </div>;
}

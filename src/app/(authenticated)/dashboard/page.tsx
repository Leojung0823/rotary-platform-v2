import Link from "next/link";
import { Badge, Card, EmptyState, Notice } from "@/components/ui";
import { hasPlatformAccess, requireIdentity } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Club = {
  club_id: string;
  club_code: string;
  club_name: string;
  club_status: string;
  permission_level: string;
};

export default async function DashboardPage() {
  const identity = await requireIdentity();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_manageable_clubs");
  const clubs = (data ?? []) as Club[];

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">工作台</p>
          <h1>{identity.display_name}，您好</h1>
          <p>您目前可管理 {error ? "—" : clubs.length} 個扶輪社。</p>
        </div>
        {hasPlatformAccess(identity) && (
          <Link className="button" href="/platform/clubs/new">
            建立扶輪社
          </Link>
        )}
      </header>

      {error ? (
        <Notice tone="error">目前無法讀取可管理的扶輪社，請稍後重新整理。</Notice>
      ) : (
        <>
          <div className="metric-grid">
            <Card>
              <span className="metric-label">可管理扶輪社</span>
              <strong className="metric-value">{clubs.length}</strong>
            </Card>
            <Card>
              <span className="metric-label">平台角色</span>
              <strong className="metric-value metric-text">
                {hasPlatformAccess(identity) ? "平台管理員" : "執行秘書"}
              </strong>
            </Card>
          </div>

          <section>
            <div className="section-heading">
              <h2>我的扶輪社</h2>
            </div>
            {clubs.length === 0 ? (
              <EmptyState
                title="尚無可管理的扶輪社"
                body="接受執行秘書邀請後，扶輪社會出現在這裡。"
              />
            ) : (
              <div className="club-grid">
                {clubs.map((club) => (
                  <Link
                    key={club.club_id}
                    href={`/clubs/${club.club_id}/operators`}
                    className="club-card"
                  >
                    <div>
                      <span className="club-code">{club.club_code}</span>
                      <h3>{club.club_name}</h3>
                    </div>
                    <Badge tone={club.club_status === "active" ? "success" : "warning"}>
                      {club.club_status === "active" ? "已啟用" : "建置中"}
                    </Badge>
                    <span className="card-link">管理執行秘書 →</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

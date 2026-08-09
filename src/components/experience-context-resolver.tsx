import Link from "next/link";
import { setActiveClubPreferenceAction } from "@/app/experience-context-actions";
import { Badge, Button, Card, EmptyState, Notice } from "@/components/ui";
import {
  activeClubForMode,
  clubsForExperienceMode,
  resolveExperienceMode,
  type ClubContext,
  type ExperienceContext,
  type ExperienceMode,
} from "@/lib/experience-context";
import { resolveExperienceDashboard } from "@/lib/experience-routing";

const modeLabels: Record<ExperienceMode, string> = {
  member: "社員模式",
  management: "社務管理模式",
  platform: "平台管理模式",
};

function clubDestination(mode: Exclude<ExperienceMode, "platform">, club: ClubContext) {
  return mode === "member"
    ? `/club/${encodeURIComponent(club.clubId)}`
    : `/clubs/${encodeURIComponent(club.clubId)}/identity`;
}

export function ExperienceContextResolver({
  context,
  requestedMode,
}: {
  context: ExperienceContext;
  requestedMode: unknown;
}) {
  const mode = resolveExperienceMode(context, requestedMode);
  const route = resolveExperienceDashboard(context, mode);
  if (route.kind === "access_denied") {
    return <Notice tone="error">目前無法解析可用的角色脈絡，請稍後重新整理。</Notice>;
  }

  const clubs = clubsForExperienceMode(context, mode);
  const activeClub = activeClubForMode(context, mode);
  return <div className="page-stack">
    <header className="page-header">
      <div>
        <p className="eyebrow">工作台</p>
        <h1>角色與作用社別</h1>
        <p>模式與作用社別僅決定導覽；每個頁面和資料庫操作仍會重新驗證權限與社別。</p>
      </div>
      <Badge tone="success">{modeLabels[mode]}</Badge>
    </header>

    {context.availableModes.length > 1 && <nav className="form-actions" aria-label="工作模式">
      {context.availableModes.map((availableMode) => <Link
        key={availableMode}
        className={availableMode === mode ? "button" : "button button-secondary"}
        href={`/dashboard?mode=${encodeURIComponent(availableMode)}`}
        aria-current={availableMode === mode ? "page" : undefined}
      >
        {modeLabels[availableMode]}
      </Link>)}
    </nav>}

    {mode === "platform" ? <Card>
      <p className="eyebrow">平台管理</p>
      <h2>平台管理入口</h2>
      <p>平台權限不會將作用社別當成資料授權來源。</p>
      <Link className="card-link" href={route.destination}>前往平台管理 →</Link>
    </Card> : clubs.length === 0 ? <EmptyState
      title="目前沒有可用的扶輪社"
      body="作用社別已失效，請聯絡平台或社務管理員確認社籍與權限。"
    /> : <section>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{modeLabels[mode]}</p>
          <h2>選擇作用扶輪社</h2>
        </div>
        {activeClub && <span>目前：{activeClub.clubName}</span>}
      </div>
      <div className="club-grid">
        {clubs.map((club) => <Card key={club.clubId}>
          <span className="club-code">{club.clubCode}</span>
          <h3>{club.clubName}</h3>
          <p>{club.clubId === activeClub?.clubId ? "目前作用社別" : "可切換為作用社別"}</p>
          <div className="form-actions">
            <Link className="button button-secondary" href={clubDestination(mode, club)}>前往 →</Link>
            <form action={setActiveClubPreferenceAction}>
              <input type="hidden" name="clubId" value={club.clubId} />
              <input type="hidden" name="mode" value={mode} />
              <Button type="submit">設為作用社別</Button>
            </form>
          </div>
        </Card>)}
      </div>
    </section>}
  </div>;
}

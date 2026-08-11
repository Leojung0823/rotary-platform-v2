import Link from "next/link";
import { Badge, Card, EmptyState } from "@/components/ui";
import { activeClubForMode, type ExperienceContext, type ExperienceMode } from "@/lib/experience-context";
import type { Identity } from "@/lib/auth";

const modeContent: Readonly<Record<ExperienceMode, Readonly<{
  eyebrow: string;
  description: string;
}>>> = {
  member: {
    eyebrow: "社員模式",
    description: "從這裡前往目前扶輪社、活動與簽到。每個目的地仍會自行確認您的權限。",
  },
  management: {
    eyebrow: "社務管理模式",
    description: "目前導覽只連到已上線的社員與社務資料功能；出席管理介面仍在後續 PR。",
  },
  platform: {
    eyebrow: "平台管理模式",
    description: "平台權限與作用社別分開處理，這裡不會把全平台扶輪社設為作用社別。",
  },
};

export function RoleAwareDashboardLanding({
  identity,
  context,
  mode,
}: {
  identity: Identity;
  context: ExperienceContext;
  mode: ExperienceMode;
}) {
  const content = modeContent[mode];
  const activeClub = activeClubForMode(context, mode);
  const memberDestination = activeClub ? `/club/${encodeURIComponent(activeClub.clubId)}?mode=member` : null;
  const managementDestination = activeClub ? `/clubs/${encodeURIComponent(activeClub.clubId)}/members?mode=management` : null;

  return <div className="page-stack">
    <header className="page-header">
      <div>
        <p className="eyebrow">{content.eyebrow}</p>
        <h1>{identity.display_name}，您好</h1>
        <p>{content.description}</p>
      </div>
      {activeClub && <Badge tone="success">{activeClub.clubName}</Badge>}
    </header>

    {mode === "platform" ? <Card>
      <h2>平台管理工作台</h2>
      <p>扶輪社管理是目前已可使用的平台目的地。</p>
      <Link className="card-link" href="/platform/clubs?mode=platform">前往扶輪社管理 →</Link>
    </Card> : !activeClub ? <EmptyState
      title="目前沒有可用的扶輪社"
      body="作用社別已失效，請聯絡平台或社務管理員確認社籍與權限。"
    /> : <Card>
      <p className="eyebrow">目前作用扶輪社</p>
      <h2>{activeClub.clubName}</h2>
      <p>{mode === "member" ? "可查看扶輪社首頁、活動與簽到。" : "可開啟已上線的社員管理與社務資料。"}</p>
      <Link className="card-link" href={mode === "member" ? memberDestination! : managementDestination!}>
        {mode === "member" ? "前往我的扶輪社 →" : "前往社員管理 →"}
      </Link>
    </Card>}
  </div>;
}

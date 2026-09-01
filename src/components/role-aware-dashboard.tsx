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
    description: "常用工作放在導覽列，較少使用的社務工具集中在這裡；每個功能仍由後端再次確認權限。",
  },
  platform: {
    eyebrow: "平台管理模式",
    description: "平台權限與作用社別分開處理，這裡不會把全平台扶輪社設為作用社別。",
  },
};

type ManagementFeatures = Readonly<{
  blessingIouEnabled: boolean;
  birthdayCollectionEnabled: boolean;
  archiveHandoverEnabled: boolean;
  messageCenterEnabled: boolean;
}>;

function managementToolHref(clubId: string, path: string) {
  return `/clubs/${encodeURIComponent(clubId)}/${path}?mode=management`;
}

function ManagementToolCard({
  id,
  title,
  description,
  href,
}: {
  id: string;
  title: string;
  description: string;
  href: string;
}) {
  return <Link
    className="club-card"
    href={href}
    prefetch={false}
    data-testid={`management-card-${id}`}
  >
    <div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
    <span className="card-link">開啟管理 →</span>
  </Link>;
}

export function RoleAwareDashboardLanding({
  identity,
  context,
  mode,
  managementPermissions = [],
  managementFeatures = {
    blessingIouEnabled: false,
    birthdayCollectionEnabled: false,
    archiveHandoverEnabled: false,
    messageCenterEnabled: false,
  },
}: {
  identity: Identity;
  context: ExperienceContext;
  mode: ExperienceMode;
  managementPermissions?: readonly string[];
  managementFeatures?: ManagementFeatures;
}) {
  const content = modeContent[mode];
  const activeClub = activeClubForMode(context, mode);
  const memberDestination = activeClub ? `/club/${encodeURIComponent(activeClub.clubId)}?mode=member` : null;
  const hasPermission = (permission: string) => managementPermissions.includes(permission);
  const managementTools = activeClub && mode === "management" ? [
    hasPermission("member.manage") ? {
      id: "members",
      title: "社員管理",
      description: "查看社員、調整社籍與處理邀請相關工作。",
      href: managementToolHref(activeClub.clubId, "members"),
    } : null,
    hasPermission("invitation.manage") ? {
      id: "invitations",
      title: "邀請管理",
      description: "建立、重送或取消社員邀請。",
      href: managementToolHref(activeClub.clubId, "invitations"),
    } : null,
    hasPermission("identity.read") ? {
      id: "identity",
      title: "社務資料",
      description: "維護扶輪社名稱與基本資料。",
      href: managementToolHref(activeClub.clubId, "identity"),
    } : null,
    managementFeatures.blessingIouEnabled && hasPermission("blessing_iou.manage") ? {
      id: "blessing-iou",
      title: "祝福 IOU",
      description: "查看祝福、承諾捐款與收款統計。",
      href: managementToolHref(activeClub.clubId, "blessing-iou"),
    } : null,
    managementFeatures.birthdayCollectionEnabled && hasPermission("member.manage") ? {
      id: "birthday-collection",
      title: "生日祝福徵集",
      description: "派發每人一則生日任務、審核內容與管理題庫。",
      href: managementToolHref(activeClub.clubId, "birthday-collection"),
    } : null,
    managementFeatures.archiveHandoverEnabled && hasPermission("member.manage") ? {
      id: "archives",
      title: "文件中心與年度交接",
      description: "管理年度文件、版本與交接清單。",
      href: managementToolHref(activeClub.clubId, "archives"),
    } : null,
    hasPermission("role.manage") ? {
      id: "operators",
      title: "執行秘書管理",
      description: "管理社務操作人員與管理範圍。",
      href: managementToolHref(activeClub.clubId, "operators"),
    } : null,
    managementFeatures.messageCenterEnabled && hasPermission("member.manage") ? {
      id: "messages",
      title: "訊息中心",
      description: "處理社內公告與待回覆訊息。",
      href: "/messages?mode=management",
    } : null,
  ].filter((tool): tool is NonNullable<typeof tool> => tool !== null) : [];

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
    /> : mode === "member" ? <Card>
      <p className="eyebrow">目前作用扶輪社</p>
      <h2>{activeClub.clubName}</h2>
      <p>可查看扶輪社首頁、活動與簽到。</p>
      <Link className="card-link" href={memberDestination!}>前往我的扶輪社 →</Link>
    </Card> : null}
    {mode === "management" && activeClub && <section aria-labelledby="management-tools-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">社務工具</p>
          <h2 id="management-tools-heading">常用管理功能</h2>
        </div>
        <span>{managementTools.length} 項可用功能</span>
      </div>
      {managementTools.length === 0 ? <EmptyState
        title="目前沒有可用的管理工具"
        body="您的管理模式已開啟，但目前沒有可操作的社務權限；若這不符合預期，請聯絡社長或平台管理員。"
      /> : <div className="club-grid">
        {managementTools.map((tool) => <ManagementToolCard key={tool.id} {...tool} />)}
      </div>}
    </section>}
  </div>;
}

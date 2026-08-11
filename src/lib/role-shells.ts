import {
  activeClubForMode,
  resolveExperienceMode,
  type ExperienceContext,
  type ExperienceMode,
} from "./experience-context";

export type RoleShellResolution =
  | Readonly<{ kind: "legacy"; contextUnavailable: boolean }>
  | Readonly<{ kind: "role_aware"; mode: ExperienceMode }>;

export type ShellNavigationItem = Readonly<{
  id: string;
  label: string;
  mobileLabel: string;
  icon: string;
  href: string;
}>;

type NavigationDefinition = Readonly<{
  id: string;
  label: string;
  mobileLabel: string;
  icon: string;
  href: (context: ExperienceContext, mode: ExperienceMode) => string | null;
}>;

const navigationByMode: Readonly<Record<ExperienceMode, readonly NavigationDefinition[]>> = {
  member: [
    { id: "home", label: "首頁", mobileLabel: "首頁", icon: "⌂", href: () => "/dashboard" },
    { id: "events", label: "活動", mobileLabel: "活動", icon: "◇", href: () => "/events" },
    { id: "checkin", label: "簽到", mobileLabel: "簽到", icon: "✓", href: () => "/events/checkin" },
    { id: "directory", label: "社員名錄", mobileLabel: "名錄", icon: "◎", href: () => "/directory" },
    { id: "account", label: "我的", mobileLabel: "我的", icon: "◉", href: () => "/me" },
  ],
  management: [
    { id: "overview", label: "社務總覽", mobileLabel: "總覽", icon: "⌂", href: () => "/dashboard" },
    {
      id: "members",
      label: "社員管理",
      mobileLabel: "社員",
      icon: "◎",
      href: (context) => activeClubForMode(context, "management")
        ? `/clubs/${encodeURIComponent(activeClubForMode(context, "management")!.clubId)}/members`
        : null,
    },
    {
      id: "invitations",
      label: "邀請管理",
      mobileLabel: "邀請",
      icon: "+",
      href: (context) => activeClubForMode(context, "management")
        ? `/clubs/${encodeURIComponent(activeClubForMode(context, "management")!.clubId)}/invitations`
        : null,
    },
    {
      id: "club-settings",
      label: "社務資料",
      mobileLabel: "社務",
      icon: "≡",
      href: (context) => activeClubForMode(context, "management")
        ? `/clubs/${encodeURIComponent(activeClubForMode(context, "management")!.clubId)}/identity`
        : null,
    },
  ],
  platform: [
    { id: "overview", label: "平台總覽", mobileLabel: "總覽", icon: "⌂", href: () => "/dashboard" },
    { id: "clubs", label: "扶輪社管理", mobileLabel: "扶輪社", icon: "◎", href: () => "/platform/clubs" },
    { id: "new-club", label: "建立扶輪社", mobileLabel: "建立", icon: "+", href: () => "/platform/clubs/new" },
  ],
};

function withModePreference(href: string, mode: ExperienceMode) {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}mode=${encodeURIComponent(mode)}`;
}

export function resolveRoleShell({
  roleShellsEnabled,
  context,
  requestedMode,
}: {
  roleShellsEnabled: boolean;
  context: ExperienceContext | null;
  requestedMode: unknown;
}): RoleShellResolution {
  if (!roleShellsEnabled) return { kind: "legacy", contextUnavailable: false };
  if (!context) return { kind: "legacy", contextUnavailable: true };
  return { kind: "role_aware", mode: resolveExperienceMode(context, requestedMode) };
}

export function roleShellNavigation(
  context: ExperienceContext,
  mode: ExperienceMode,
): readonly ShellNavigationItem[] {
  return navigationByMode[mode].flatMap((definition) => {
    const href = definition.href(context, mode);
    return href ? [{
      id: definition.id,
      label: definition.label,
      mobileLabel: definition.mobileLabel,
      icon: definition.icon,
      href: withModePreference(href, mode),
    }] : [];
  });
}

export const roleShellModeLabels: Readonly<Record<ExperienceMode, string>> = {
  member: "社員模式",
  management: "社務管理模式",
  platform: "平台管理模式",
};

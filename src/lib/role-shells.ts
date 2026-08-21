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
  // True only for links that cross a mode boundary (member -> management).
  // The shell's mode is resolved in the shared (authenticated) layout, which
  // Next.js's client router cache does not re-render on a soft navigation
  // between sibling routes -- a plain anchor forces a full navigation so the
  // new mode actually takes effect, matching ModeSwitcher's <a> tags.
  forceReload?: boolean;
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
    { id: "events", label: "活動", mobileLabel: "活動", icon: "◇", href: () => "/events" },
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
  { blessingIouEnabled = false, attendanceEnabled = false }: {
    blessingIouEnabled?: boolean;
    attendanceEnabled?: boolean;
  } = {},
): readonly ShellNavigationItem[] {
  const items: ShellNavigationItem[] = navigationByMode[mode].flatMap((definition) => {
    const href = definition.href(context, mode);
    return href ? [{
      id: definition.id,
      label: definition.label,
      mobileLabel: definition.mobileLabel,
      icon: definition.icon,
      href: withModePreference(href, mode),
    }] : [];
  });

  // Both entries are gated on the same flag as the pages they open, so the
  // nav can never offer a link that renders notFound().
  if (attendanceEnabled && (mode === "member" || mode === "management")) {
    const isMember = mode === "member";
    const anchorId = isMember ? "directory" : "members";
    const anchorIndex = items.findIndex((item) => item.id === anchorId);
    const attendanceItem: ShellNavigationItem = {
      id: "attendance",
      label: isMember ? "我的出席" : "出席管理",
      mobileLabel: "出席",
      icon: "％",
      href: withModePreference(isMember ? "/attendance" : "/attendance/manage", mode),
    };
    if (anchorIndex === -1) items.push(attendanceItem);
    else items.splice(anchorIndex, 0, attendanceItem);
  }

  if (mode === "management" && blessingIouEnabled) {
    const managedClub = activeClubForMode(context, "management");
    if (managedClub) {
      const clubSettingsIndex = items.findIndex((item) => item.id === "club-settings");
      const blessingIouItem: ShellNavigationItem = {
        id: "blessing-iou",
        label: "祝福 IOU",
        mobileLabel: "IOU",
        icon: "♡",
        href: withModePreference(
          `/clubs/${encodeURIComponent(managedClub.clubId)}/blessing-iou`,
          "management",
        ),
      };
      if (clubSettingsIndex === -1) items.push(blessingIouItem);
      else items.splice(clubSettingsIndex, 0, blessingIouItem);
    }
  }

  // The way back. Club-level managers do not get the mode switcher, so
  // without this the inline link below is a one-way door: a president could
  // enter management and had no control to return to the member experience.
  // Only offered to officers who are themselves members -- a club operator
  // with no membership has no member mode to return to.
  if (mode === "management" && !context.hasPlatformAccess
    && context.availableModes.includes("member")) {
    items.push({
      id: "member-mode",
      label: "回社員模式",
      // Not "社員": the management nav already has a 社員管理 tab whose mobile
      // label is 社員, and two identically named tabs is no way back.
      mobileLabel: "返回",
      icon: "↩",
      href: withModePreference("/dashboard", "member"),
      forceReload: true,
    });
  }

  // Club-level managers (president/secretary/operator) get a direct link
  // into their own club's management pages inline in the member nav,
  // instead of the mode-switcher UI reserved for platform admins who
  // actually manage many clubs.
  if (mode === "member" && context.canManage && !context.hasPlatformAccess) {
    const managedClub = activeClubForMode(context, "management");
    if (managedClub) {
      items.push({
        id: "manage-club",
        label: "社團管理",
        mobileLabel: "管理",
        icon: "⚙",
        href: withModePreference(`/clubs/${encodeURIComponent(managedClub.clubId)}/members`, "management"),
        forceReload: true,
      });
    }
  }

  return items;
}

export const roleShellModeLabels: Readonly<Record<ExperienceMode, string>> = {
  member: "社員模式",
  management: "社務管理模式",
  platform: "平台管理模式",
};

import type { ShellIconName } from "@/components/shell-icons";
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
  icon: ShellIconName;
  href: string;
  // Unread work waiting behind this tab. Omitted rather than zero when there
  // is nothing waiting, so a quiet inbox draws no attention at all.
  badgeCount?: number;
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
  icon: ShellIconName;
  href: (context: ExperienceContext, mode: ExperienceMode) => string | null;
}>;

const navigationByMode: Readonly<Record<ExperienceMode, readonly NavigationDefinition[]>> = {
  // 簽到 is deliberately absent: it is reached from the events page, where the
  // member already knows which event they are checking in to. 我的 is not here
  // either -- it is appended last so it stays at the end of the bar, after the
  // conditional entries.
  member: [
    { id: "home", label: "首頁", mobileLabel: "首頁", icon: "home", href: () => "/dashboard" },
    { id: "events", label: "活動", mobileLabel: "活動", icon: "calendar", href: () => "/events" },
    { id: "directory", label: "社員名錄", mobileLabel: "名錄", icon: "users", href: () => "/directory" },
  ],
  management: [
    { id: "overview", label: "社務總覽", mobileLabel: "總覽", icon: "home", href: () => "/dashboard" },
    { id: "events", label: "活動", mobileLabel: "活動", icon: "calendar", href: () => "/events" },
    {
      id: "members",
      label: "社員管理",
      mobileLabel: "社員",
      icon: "users",
      href: (context) => activeClubForMode(context, "management")
        ? `/clubs/${encodeURIComponent(activeClubForMode(context, "management")!.clubId)}/members`
        : null,
    },
    {
      id: "invitations",
      label: "邀請管理",
      mobileLabel: "邀請",
      icon: "userPlus",
      href: (context) => activeClubForMode(context, "management")
        ? `/clubs/${encodeURIComponent(activeClubForMode(context, "management")!.clubId)}/invitations`
        : null,
    },
    {
      id: "club-settings",
      label: "社務資料",
      mobileLabel: "社務",
      icon: "gear",
      href: (context) => activeClubForMode(context, "management")
        ? `/clubs/${encodeURIComponent(activeClubForMode(context, "management")!.clubId)}/identity`
        : null,
    },
  ],
  platform: [
    { id: "overview", label: "平台總覽", mobileLabel: "總覽", icon: "home", href: () => "/dashboard" },
    { id: "clubs", label: "扶輪社管理", mobileLabel: "扶輪社", icon: "building", href: () => "/platform/clubs" },
    { id: "new-club", label: "建立扶輪社", mobileLabel: "建立", icon: "plus", href: () => "/platform/clubs/new" },
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
  {
    blessingIouEnabled = false,
    attendanceEnabled = false,
    messageCenterEnabled = false,
    unreadMessageCount = 0,
  }: {
    blessingIouEnabled?: boolean;
    attendanceEnabled?: boolean;
    messageCenterEnabled?: boolean;
    unreadMessageCount?: number;
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

  // Management keeps a tab of its own, because taking rosters and recording
  // adjustments is a job done repeatedly. A member's own attendance is
  // something they check occasionally, so it lives inside 我的 instead of
  // spending a tab. Gated on the same flag as the page it opens, so the nav
  // can never offer a link that renders notFound().
  if (attendanceEnabled && mode === "management") {
    const anchorIndex = items.findIndex((item) => item.id === "members");
    const attendanceItem: ShellNavigationItem = {
      id: "attendance",
      label: "出席管理",
      mobileLabel: "出席",
      icon: "chart",
      href: withModePreference("/attendance/manage", "management"),
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
        icon: "heart",
        href: withModePreference(
          `/clubs/${encodeURIComponent(managedClub.clubId)}/blessing-iou`,
          "management",
        ),
      };
      if (clubSettingsIndex === -1) items.push(blessingIouItem);
      else items.splice(clubSettingsIndex, 0, blessingIouItem);
    }
  }

  // The message centre gets a tab of its own rather than sitting inside 社內
  // 互動: an unread count that nobody can see is not a notification. It is in
  // both member and management navigation because an officer writes messages
  // from the same page a member reads them on, and should not have to leave
  // management mode to send one. Gated on the same flag as the page it opens,
  // so the nav can never offer a link that renders notFound().
  if (mode !== "platform" && messageCenterEnabled) {
    items.push({
      id: "messages",
      label: "訊息中心",
      mobileLabel: "訊息",
      icon: "bell",
      href: withModePreference("/messages", mode),
      ...(unreadMessageCount > 0 ? { badgeCount: unreadMessageCount } : {}),
    });
  }

  // One entry for the social features. They are three separate pages that had
  // no way in at all; giving each its own tab would have pushed the member bar
  // to eight items, which does not fit 320px.
  if (mode === "member") {
    items.push({
      id: "interact",
      label: "社內互動",
      mobileLabel: "互動",
      icon: "chat",
      href: withModePreference("/interact", "member"),
    });
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
      icon: "arrowLeft",
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
        icon: "gear",
        href: withModePreference(`/clubs/${encodeURIComponent(managedClub.clubId)}/members`, "management"),
        forceReload: true,
      });
    }
  }

  // Last, so the account entry stays at the end of the bar whether or not the
  // officer link before it is present.
  if (mode === "member") {
    items.push({
      id: "account",
      label: "我的",
      mobileLabel: "我的",
      icon: "user",
      href: withModePreference("/me", "member"),
    });
  }

  return items;
}

export const roleShellModeLabels: Readonly<Record<ExperienceMode, string>> = {
  member: "社員模式",
  management: "社務管理模式",
  platform: "平台管理模式",
};

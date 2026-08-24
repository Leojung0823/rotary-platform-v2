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
  // Member navigation is deliberately fixed at four first-level destinations.
  // Check-in stays inside 活動; messages and social features stay inside 首頁;
  // management mode changes live in the account menu. None of these links is
  // an authorization boundary -- every destination still checks its own route,
  // RPC and RLS authority.
  member: [
    { id: "home", label: "首頁", mobileLabel: "首頁", icon: "home", href: () => "/dashboard" },
    { id: "events", label: "活動", mobileLabel: "活動", icon: "calendar", href: () => "/events" },
    { id: "directory", label: "社員名錄", mobileLabel: "社員", icon: "users", href: () => "/directory" },
    { id: "account", label: "我的", mobileLabel: "我的", icon: "user", href: () => "/me" },
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

function navigationDestination(item: ShellNavigationItem) {
  return item.href.split("?", 1)[0].replace(/\/$/u, "") || "/";
}

function normalizedPathname(pathname: string) {
  const withoutQuery = pathname.split(/[?#]/u, 1)[0];
  return withoutQuery.replace(/\/$/u, "") || "/";
}

export function resolveCurrentNavigationItemId(
  items: readonly ShellNavigationItem[],
  pathname: string,
): string | null {
  const currentPath = normalizedPathname(pathname);
  let bestMatch: Readonly<{ id: string; length: number }> | null = null;

  for (const item of items) {
    const destination = navigationDestination(item);
    // Dashboard is a landing page, not a parent route. Other destinations own
    // their path segment and descendants; the longest match wins.
    const matches = destination === "/dashboard"
      ? currentPath === destination
      : currentPath === destination || currentPath.startsWith(`${destination}/`);
    if (matches && (!bestMatch || destination.length > bestMatch.length)) {
      bestMatch = { id: item.id, length: destination.length };
    }
  }

  return bestMatch?.id ?? null;
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
      ...(mode === "member"
        && definition.id === "home"
        && messageCenterEnabled
        && unreadMessageCount > 0
        ? { badgeCount: unreadMessageCount }
        : {}),
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

  // Management keeps the message centre as a work destination. Member mode
  // exposes it from the homepage instead, with unread work announced there.
  if (mode === "management" && messageCenterEnabled) {
    items.push({
      id: "messages",
      label: "訊息中心",
      mobileLabel: "訊息",
      icon: "bell",
      href: withModePreference("/messages", mode),
      ...(unreadMessageCount > 0 ? { badgeCount: unreadMessageCount } : {}),
    });
  }

  return items;
}

export const roleShellModeLabels: Readonly<Record<ExperienceMode, string>> = {
  member: "社員模式",
  management: "社務管理模式",
  platform: "平台管理模式",
};

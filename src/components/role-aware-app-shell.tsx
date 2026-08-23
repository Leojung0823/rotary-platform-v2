import Link from "next/link";
import { cookies, headers } from "next/headers";
import type { CSSProperties, ReactNode } from "react";
import { setActiveClubPreferenceAction } from "@/app/experience-context-actions";
import { LegacyAppShell } from "@/components/app-shell";
import {
  activeClubForMode,
  clubsForExperienceMode,
  type ClubContext,
  type ExperienceContext,
  type ExperienceMode,
} from "@/lib/experience-context";
import { ShellIcon } from "@/components/shell-icons";
import { activeClubCookieName, readActiveClubPreference } from "@/lib/experience-context-cookie";
import { resolveExperienceContext } from "@/lib/experience-context.server";
import { displayableEmail, type Identity } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import type { FeatureFlagEvaluation } from "@/lib/product/feature-flags";
import { recordAuthenticatedProductTelemetry } from "@/lib/product/telemetry.server";
import {
  roleShellModeLabels,
  roleShellNavigation,
  resolveRoleShell,
  type ShellNavigationItem,
} from "@/lib/role-shells";
import styles from "./role-aware-app-shell.module.css";

function environmentLabel() {
  if (process.env.APP_ENV === "production") return "ONLINE";
  if (process.env.APP_ENV === "staging") return "STAGING";
  return "LOCAL";
}

function featureFlagFailureReason(evaluation: FeatureFlagEvaluation) {
  if (evaluation.reason === "missing_configuration") return "missing_configuration";
  if (evaluation.reason === "database_read_error") return "evaluation_error";
  return evaluation.reason === "invalid_configuration"
    || evaluation.reason === "invalid_environment"
    || evaluation.reason === "environment_not_allowed"
    || evaluation.reason === "rollout_subject_required"
    ? "invalid_configuration"
    : null;
}

async function recordRoleShellFlagFailure(evaluation: FeatureFlagEvaluation) {
  const reason = featureFlagFailureReason(evaluation);
  if (!reason) return;

  try {
    await recordAuthenticatedProductTelemetry({
      name: "feature_flag_evaluation_failure",
      key: "role_shells_v2",
      reason,
    });
  } catch {
    // Observability cannot make an authenticated page unavailable.
  }
}

function modeHref(mode: ExperienceMode) {
  return `/dashboard?mode=${encodeURIComponent(mode)}`;
}

/**
 * Unread messages across every club the member belongs to. Read as a plain
 * number: the shell has no use for the per-club breakdown, and a shell must
 * never fail to render because a count could not be fetched.
 */
async function readUnreadMessageCount() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("count_my_unread_club_messages");
    if (error || typeof data !== "object" || data === null) return 0;
    const total = (data as { total?: unknown }).total;
    return typeof total === "number" && Number.isInteger(total) && total > 0 ? total : 0;
  } catch {
    return 0;
  }
}

function isCurrentNavigationItem(item: ShellNavigationItem, pathname: string) {
  const destination = item.href.split("?", 1)[0];
  return destination === pathname;
}

function ModeSwitcher({ context, mode }: { context: ExperienceContext; mode: ExperienceMode }) {
  if (context.availableModes.length < 2) return null;
  return <nav className={styles.modeSwitcher} aria-label="切換工作模式">
    <span className={styles.controlLabel}>工作模式</span>
    <div className={styles.modeOptions}>
      {context.availableModes.map((availableMode) => <a
        key={availableMode}
        href={modeHref(availableMode)}
        className={availableMode === mode ? styles.modeOptionCurrent : styles.modeOption}
        aria-current={availableMode === mode ? "page" : undefined}
      >
        {roleShellModeLabels[availableMode]}
      </a>)}
    </div>
  </nav>;
}

function ClubOption({ club, mode, active }: { club: ClubContext; mode: ExperienceMode; active: boolean }) {
  return <form action={setActiveClubPreferenceAction} className={styles.clubOption}>
    <input type="hidden" name="clubId" value={club.clubId} />
    <input type="hidden" name="mode" value={mode} />
    <button type="submit" aria-current={active ? "true" : undefined}>
      <span>{club.clubName}</span>
      <small>{club.clubCode}{active ? " · 目前作用社別" : ""}</small>
    </button>
  </form>;
}

function ClubGroup({
  label,
  clubs,
  mode,
  activeClubId,
}: {
  label: string;
  clubs: readonly ClubContext[];
  mode: ExperienceMode;
  activeClubId: string | null;
}) {
  if (clubs.length === 0) return null;
  return <section className={styles.clubGroup} aria-label={label}>
    <h3>{label}</h3>
    {clubs.map((club) => <ClubOption
      key={club.clubId}
      club={club}
      mode={mode}
      active={club.clubId === activeClubId}
    />)}
  </section>;
}

function ClubSwitcher({ context, mode }: { context: ExperienceContext; mode: ExperienceMode }) {
  if (mode === "platform") {
    return <p className={styles.scopeLabel}>平台範圍不使用作用社別</p>;
  }

  const clubs = clubsForExperienceMode(context, mode);
  const activeClub = clubs.find((club) => club.clubId === context.activeClubId) ?? clubs[0] ?? null;
  const managedMemberClubs = context.memberClubs.filter((club) => club.canManage);
  return <details className={styles.clubSwitcher}>
    <summary aria-label="切換作用扶輪社">
      <span className={styles.controlLabel}>目前作用社別</span>
      <strong>{activeClub?.clubName ?? "尚無可用扶輪社"}</strong>
    </summary>
    <div className={styles.clubPanel}>
      {mode === "member" ? <ClubGroup
        label="我的扶輪社"
        clubs={context.memberClubs}
        mode={mode}
        activeClubId={activeClub?.clubId ?? null}
      /> : <>
        <ClubGroup
          label="我的扶輪社"
          clubs={managedMemberClubs}
          mode={mode}
          activeClubId={activeClub?.clubId ?? null}
        />
        <ClubGroup
          label="其他可管理扶輪社"
          clubs={context.managedOnlyClubs}
          mode={mode}
          activeClubId={activeClub?.clubId ?? null}
        />
      </>}
    </div>
  </details>;
}

function NavigationBadge({ count }: { count?: number }) {
  if (!count) return null;
  // The number is announced, not just drawn: a dot that only sighted users can
  // see is not a notification either.
  return <span className={styles.navigationBadge}>
    <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
    <span className="sr-only">{count} 則未讀訊息</span>
  </span>;
}

function ShellNavigation({ items, pathname }: { items: readonly ShellNavigationItem[]; pathname: string }) {
  return <nav className={styles.navigation} aria-label="主要導覽">
    <ul style={{ "--nav-count": items.length } as CSSProperties}>
      {items.map((item) => <li key={item.id}>
        {item.forceReload
          ? <a href={item.href} aria-current={isCurrentNavigationItem(item, pathname) ? "page" : undefined}>
              <span className={styles.navigationIcon}><ShellIcon name={item.icon} /></span>
              <span className={styles.desktopLabel}>{item.label}</span>
              <span className={styles.mobileLabel}>{item.mobileLabel}</span>
              <NavigationBadge count={item.badgeCount} />
            </a>
          : <Link
              href={item.href}
              prefetch={false}
              aria-current={isCurrentNavigationItem(item, pathname) ? "page" : undefined}
            >
              <span className={styles.navigationIcon}><ShellIcon name={item.icon} /></span>
              <span className={styles.desktopLabel}>{item.label}</span>
              <span className={styles.mobileLabel}>{item.mobileLabel}</span>
              <NavigationBadge count={item.badgeCount} />
            </Link>}
      </li>)}
    </ul>
  </nav>;
}

function AccountMenu({ identity, mode }: { identity: Identity; mode: ExperienceMode }) {
  return <details className={styles.accountMenu}>
    <summary aria-label="帳號選單">
      <span className={styles.avatar} aria-hidden="true">{identity.display_name.slice(0, 1)}</span>
      <span className={styles.accountSummary}>
        <strong>{identity.display_name}</strong>
        <small>帳號選單</small>
      </span>
    </summary>
    <div className={styles.accountPanel}>
      {displayableEmail(identity) && <p>{displayableEmail(identity)}</p>}
      <Link href={`/me?mode=${encodeURIComponent(mode)}`} prefetch={false}>我的帳號</Link>
      <form action="/api/auth/line/logout?redirect=1" method="post">
        <button type="submit">登出</button>
      </form>
    </div>
  </details>;
}

function MobileShellContext({ context, mode }: { context: ExperienceContext; mode: ExperienceMode }) {
  const activeClub = activeClubForMode(context, mode);
  return <p className={styles.mobileContext}>
    {roleShellModeLabels[mode]}{activeClub ? ` · ${activeClub.clubName}` : " · 平台範圍"}
  </p>;
}

export function RoleAwareAppShell({
  identity,
  context,
  mode,
  pathname,
  blessingIouEnabled = false,
  attendanceEnabled = false,
  messageCenterEnabled = false,
  unreadMessageCount = 0,
  children,
}: {
  identity: Identity;
  context: ExperienceContext;
  mode: ExperienceMode;
  pathname: string;
  blessingIouEnabled?: boolean;
  attendanceEnabled?: boolean;
  messageCenterEnabled?: boolean;
  unreadMessageCount?: number;
  children: ReactNode;
}) {
  const navigation = roleShellNavigation(context, mode, {
    blessingIouEnabled,
    attendanceEnabled,
    messageCenterEnabled,
    unreadMessageCount,
  });
  return <div className={`${styles.shell} ${styles[`shell${mode[0].toUpperCase()}${mode.slice(1)}`]}`}>
    <aside className={styles.rail}>
      <header className={styles.header}>
        <Link href={modeHref(mode)} prefetch={false} className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">R</span>
          <span>
            扶輪管理平台
            <small>ROTARY V2 · {environmentLabel()}</small>
          </span>
        </Link>
        <p className={styles.modeName}>{roleShellModeLabels[mode]}</p>
        {context.hasPlatformAccess && <>
          <MobileShellContext context={context} mode={mode} />
          <ModeSwitcher context={context} mode={mode} />
        </>}
        {/* A single club is the common case (one person, one club) and needs
            no picker. Platform admins keep the switcher regardless of count
            (they oversee the whole platform); everyone else only gets it if
            they genuinely manage more than one club (a multi-club operator,
            never a multi-club member — membership and operator status are
            mutually exclusive). */}
        {(context.hasPlatformAccess || clubsForExperienceMode(context, mode).length > 1)
          && <ClubSwitcher context={context} mode={mode} />}
      </header>
      <ShellNavigation items={navigation} pathname={pathname} />
      <AccountMenu identity={identity} mode={mode} />
    </aside>
    <main id="main" tabIndex={-1} className={styles.content}>{children}</main>
  </div>;
}

export async function RoleAwareAppShellBoundary({
  identity,
  children,
}: {
  identity: Identity;
  children: ReactNode;
}) {
  // A hosted Supabase round trip is the dominant cost of rendering an
  // authenticated page, so what matters is how many of them sit on the
  // critical path. The flag read and the role-context RPC do not depend on
  // each other, so they are issued together rather than one after the other.
  // Neither rejects -- both resolve to a failure value -- so the flag-disabled
  // path can return without awaiting the context.
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const contextPromise = resolveExperienceContext(
    readActiveClubPreference(cookieStore.get(activeClubCookieName)?.value),
  );

  // The unread count joins this group rather than following the flag read:
  // issued together it costs no additional sequential round trip, and the
  // result is simply discarded when the message centre is switched off.
  const [
    evaluation,
    blessingIouEvaluation,
    attendanceEvaluation,
    messageCenterEvaluation,
    messageBoardEvaluation,
    unreadMessageCount,
  ] = await Promise.all([
    evaluateCurrentFeatureFlag({ key: "role_shells_v2", subjectUuid: identity.id }),
    evaluateCurrentFeatureFlag({ key: "blessing_iou_v1", subjectUuid: identity.id }),
    evaluateCurrentFeatureFlag({ key: "attendance_ui_v2", subjectUuid: identity.id }),
    evaluateCurrentFeatureFlag({ key: "announcements_v09", subjectUuid: identity.id }),
    evaluateCurrentFeatureFlag({ key: "message_board_v1", subjectUuid: identity.id }),
    readUnreadMessageCount(),
  ]);
  if (!evaluation.enabled) {
    void contextPromise;
    void recordRoleShellFlagFailure(evaluation);
    return <LegacyAppShell
      identity={identity}
      messageBoardEnabled={messageBoardEvaluation.enabled}
    >
      {children}
    </LegacyAppShell>;
  }

  const contextResolution = await contextPromise;
  const shell = resolveRoleShell({
    roleShellsEnabled: true,
    context: contextResolution.ok ? contextResolution.context : null,
    requestedMode: headerStore.get("x-rotary-requested-mode"),
  });
  if (!contextResolution.ok || shell.kind === "legacy") {
    return <LegacyAppShell
      identity={identity}
      fallbackNotice="目前無法解析新版角色脈絡，已安全保留原有導覽；請稍後重新整理。"
      messageBoardEnabled={messageBoardEvaluation.enabled}
    >
      {children}
    </LegacyAppShell>;
  }

  return <RoleAwareAppShell
    identity={identity}
    context={contextResolution.context}
    mode={shell.mode}
    pathname={headerStore.get("x-rotary-pathname") ?? "/dashboard"}
    blessingIouEnabled={blessingIouEvaluation.enabled}
    attendanceEnabled={attendanceEvaluation.enabled}
    messageCenterEnabled={messageCenterEvaluation.enabled}
    unreadMessageCount={unreadMessageCount}
  >
    {children}
  </RoleAwareAppShell>;
}

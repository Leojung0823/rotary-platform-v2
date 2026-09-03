import Link from "next/link";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { setActiveClubPreferenceAction } from "@/app/experience-context-actions";
import { LegacyAppShell } from "@/components/app-shell";
import {
  activeClubForMode,
  clubsForExperienceMode,
  type ClubContext,
  type ExperienceContext,
  type ExperienceMode,
} from "@/lib/experience-context";
import { RoleAwareShellNavigation } from "@/components/role-aware-shell-navigation";
import { activeClubCookieName, readActiveClubPreference } from "@/lib/experience-context-cookie";
import { resolveExperienceContext } from "@/lib/experience-context.server";
import { readClubPermissions } from "@/lib/club-permissions.server";
import { displayableEmail, type Identity } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import type { FeatureFlagEvaluation } from "@/lib/product/feature-flags";
import { recordAuthenticatedProductTelemetry } from "@/lib/product/telemetry.server";
import {
  roleShellModeLabels,
  roleShellNavigation,
  resolveRoleShell,
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

function AccountMenu({
  identity,
  context,
  mode,
}: {
  identity: Identity;
  context: ExperienceContext;
  mode: ExperienceMode;
}) {
  const managedClub = mode === "member"
    && !context.hasPlatformAccess
    && context.availableModes.includes("management")
    ? activeClubForMode(context, "management")
    : null;
  const canReturnToMember = mode === "management"
    && !context.hasPlatformAccess
    && context.availableModes.includes("member");

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
      {managedClub && <a href={`/clubs/${encodeURIComponent(managedClub.clubId)}/members?mode=management`}>進入社務管理</a>}
      {canReturnToMember && <a href={modeHref("member")}>回社員模式</a>}
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
  attendanceEnabled = false,
  messageCenterEnabled = false,
  unreadMessageCount = 0,
  managementPermissions = [],
  children,
}: {
  identity: Identity;
  context: ExperienceContext;
  mode: ExperienceMode;
  pathname: string;
  attendanceEnabled?: boolean;
  messageCenterEnabled?: boolean;
  unreadMessageCount?: number;
  managementPermissions?: readonly string[];
  children: ReactNode;
}) {
  const navigation = roleShellNavigation(context, mode, {
    attendanceEnabled,
    messageCenterEnabled,
    unreadMessageCount,
    managementPermissions,
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
        {/* A single club is the common case and needs no picker. Platform
            admins keep the switcher regardless of count (they oversee the whole
            platform); everyone else gets it once they actually have more than
            one club in this mode -- which now includes a member of two clubs,
            and a member who is also another club's executive secretary. */}
        {(context.hasPlatformAccess || clubsForExperienceMode(context, mode).length > 1)
          && <ClubSwitcher context={context} mode={mode} />}
      </header>
      <RoleAwareShellNavigation items={navigation} initialPathname={pathname} />
      <AccountMenu identity={identity} context={context} mode={mode} />
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
    attendanceEvaluation,
    messageCenterEvaluation,
    messageBoardEvaluation,
    unreadMessageCount,
  ] = await Promise.all([
    evaluateCurrentFeatureFlag({ key: "role_shells_v2", subjectUuid: identity.id }),
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

  // The shell can hide management destinations only from a permission
  // projection returned by the database. A failed read fails closed, while
  // the route's own RPC/RLS checks remain the real authorization boundary.
  const managedClub = activeClubForMode(contextResolution.context, shell.mode);
  const managementPermissionResult = shell.mode === "management" && managedClub
    ? await readClubPermissions(managedClub.clubId)
    : { ok: true, permissions: [] as readonly string[] };

  return <RoleAwareAppShell
    identity={identity}
    context={contextResolution.context}
    mode={shell.mode}
    pathname={headerStore.get("x-rotary-pathname") ?? "/dashboard"}
    attendanceEnabled={attendanceEvaluation.enabled}
    messageCenterEnabled={messageCenterEvaluation.enabled}
    unreadMessageCount={unreadMessageCount}
    managementPermissions={managementPermissionResult.permissions}
  >
    {children}
  </RoleAwareAppShell>;
}

import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Badge, Card, EmptyState, Notice } from "@/components/ui";
import { ExperienceContextResolver } from "@/components/experience-context-resolver";
import { MemberHome } from "@/components/member-home";
import { RoleAwareDashboardLanding } from "@/components/role-aware-dashboard";
import { resolveDashboardRoleContext } from "@/lib/dashboard-role-context";
import { hasPlatformAccess, requireIdentity, type Identity } from "@/lib/auth";
import { activeClubForMode } from "@/lib/experience-context";
import {
  activeClubCookieName,
  readActiveClubPreference,
} from "@/lib/experience-context-cookie";
import { resolveExperienceContext } from "@/lib/experience-context.server";
import { dashboardAccessPresentation } from "@/lib/dashboard-access";
import {
  evaluateCurrentFeatureFlag,
  readFeatureFlagRecords,
} from "@/lib/product/feature-flag-adapter.server";
import type { FeatureFlagEvaluation } from "@/lib/product/feature-flags";
import { recordAuthenticatedProductTelemetry } from "@/lib/product/telemetry.server";
import { createClient } from "@/lib/supabase/server";

type Club = {
  club_id: string;
  club_code: string;
  club_name: string;
  club_status: string;
  permission_level: string;
};

async function recordRoleContextFlagFailure(evaluation: FeatureFlagEvaluation) {
  const reason = evaluation.reason === "missing_configuration"
    ? "missing_configuration"
    : evaluation.reason === "invalid_configuration"
      || evaluation.reason === "invalid_environment"
      || evaluation.reason === "environment_not_allowed"
      || evaluation.reason === "rollout_subject_required"
      ? "invalid_configuration"
      : evaluation.reason === "database_read_error"
        ? "evaluation_error"
        : null;
  if (!reason) return;

  try {
    await recordAuthenticatedProductTelemetry({
      name: "feature_flag_evaluation_failure",
      key: "role_context_v2",
      reason,
    });
  } catch {
    // Observability cannot make an authenticated page unavailable.
  }
}

async function recordMemberHomeFlagFailure(evaluation: FeatureFlagEvaluation) {
  const reason = evaluation.reason === "missing_configuration"
    ? "missing_configuration"
    : evaluation.reason === "invalid_configuration"
      || evaluation.reason === "invalid_environment"
      || evaluation.reason === "environment_not_allowed"
      || evaluation.reason === "rollout_subject_required"
      ? "invalid_configuration"
      : evaluation.reason === "database_read_error"
        ? "evaluation_error"
        : null;
  if (!reason) return;

  try {
    await recordAuthenticatedProductTelemetry({
      name: "feature_flag_evaluation_failure",
      key: "member_home_v2",
      reason,
    });
  } catch {
    // Observability cannot make an authenticated page unavailable.
  }
}

async function LegacyDashboard({
  identity,
  contextUnavailable = false,
}: {
  identity: Identity;
  contextUnavailable?: boolean;
}) {
  const { data, error } = await createClient().then((supabase) => supabase.rpc("list_manageable_clubs"));
  const clubs = (data ?? []) as Club[];
  const platformAccess = hasPlatformAccess(identity);
  const accessPresentation = dashboardAccessPresentation(platformAccess, clubs);
  const clubCount = error ? "—" : clubs.length;

  return (
    <div className="page-stack">
      {contextUnavailable && <Notice tone="error">
        目前無法解析新版角色脈絡，已安全保留原有工作台；請稍後重新整理。
      </Notice>}
      <header className="page-header">
        <div>
          <p className="eyebrow">工作台</p>
          <h1>{identity.display_name}，您好</h1>
          <p>
            {accessPresentation.canManageClubs
              ? `您目前可管理 ${clubCount} 個扶輪社。`
              : `您目前加入 ${clubCount} 個扶輪社。`}
          </p>
        </div>
        <div className="form-actions">
          <Link className="button button-secondary" href="/features">
            功能總覽
          </Link>
          {platformAccess && (
            <Link className="button" href="/platform/clubs/new">
              建立扶輪社
            </Link>
          )}
        </div>
      </header>

      {error ? (
        <Notice tone="error">目前無法讀取扶輪社資料，請稍後重新整理。</Notice>
      ) : (
        <>
          <div className="metric-grid">
            <Card>
              <span className="metric-label">{accessPresentation.clubCountLabel}</span>
              <strong className="metric-value">{clubs.length}</strong>
            </Card>
            <Card>
              <span className="metric-label">帳號角色</span>
              <strong className="metric-value metric-text">{accessPresentation.roleLabel}</strong>
            </Card>
          </div>

          <section>
            <div className="section-heading">
              <h2>我的扶輪社</h2>
            </div>
            {clubs.length === 0 ? (
              <EmptyState title="尚未加入扶輪社" body="接受扶輪社邀請後，扶輪社會出現在這裡。" />
            ) : (
              <div className="club-grid">
                {clubs.map((club) => {
                  const canManageIdentity =
                    club.permission_level === "platform_admin" || club.permission_level === "club_manager";
                  return (
                    <Link
                      key={club.club_id}
                      href={canManageIdentity ? `/clubs/${club.club_id}/identity` : `/club/${club.club_id}`}
                      className="club-card"
                    >
                      <div>
                        <span className="club-code">{club.club_code}</span>
                        <h3>{club.club_name}</h3>
                      </div>
                      <Badge tone={club.club_status === "active" ? "success" : "warning"}>
                        {club.club_status === "active" ? "已啟用" : "建置中"}
                      </Badge>
                      <span className="card-link">
                        {canManageIdentity ? "開啟身份管理 →" : "進入扶輪社首頁 →"}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  // Identity, the feature-flag records and the role context are each
  // authorised by this request's own cookies, so none of them needs another's
  // answer first. Issue all three before awaiting any: on hosted Supabase each
  // round trip costs roughly a third of a second, and this page used to spend
  // three of them in a row before it could read the member's home projection.
  // None of these rejects -- each resolves to a failure value -- so an early
  // return cannot strand a pending promise.
  const [cookieStore, query] = await Promise.all([cookies(), searchParams]);
  const preferredClubId = readActiveClubPreference(cookieStore.get(activeClubCookieName)?.value);
  const flagRecordsPromise = readFeatureFlagRecords();
  const contextPromise = resolveExperienceContext(preferredClubId);

  const identity = await requireIdentity();
  await flagRecordsPromise;
  const [evaluation, roleShellsEvaluation, memberHomeEvaluation, blessingIouEvaluation] = await Promise.all([
    evaluateCurrentFeatureFlag({ key: "role_context_v2", subjectUuid: identity.id }),
    evaluateCurrentFeatureFlag({ key: "role_shells_v2", subjectUuid: identity.id }),
    evaluateCurrentFeatureFlag({ key: "member_home_v2", subjectUuid: identity.id }),
    evaluateCurrentFeatureFlag({ key: "blessing_iou_v1", subjectUuid: identity.id }),
  ]);
  if (!evaluation.enabled) {
    void contextPromise;
    void recordRoleContextFlagFailure(evaluation);
    return <LegacyDashboard identity={identity} />;
  }

  const context = await contextPromise;
  if (!context.ok && context.reason === "authorization_denied") redirect("/access-denied");
  const resolved = resolveDashboardRoleContext({
    roleContextEnabled: true,
    context: context.ok ? context.context : null,
    requestedMode: query.mode,
  });
  if (resolved.kind === "legacy") {
    return <LegacyDashboard identity={identity} contextUnavailable={resolved.contextUnavailable} />;
  }
  if (!context.ok) return <LegacyDashboard identity={identity} contextUnavailable />;
  if (resolved.resolution.kind === "access_denied") {
    return <ExperienceContextResolver context={context.context} requestedMode={null} />;
  }

  if (roleShellsEvaluation.enabled) {
    if (resolved.resolution.mode === "member") {
      if (!memberHomeEvaluation.enabled) {
        void recordMemberHomeFlagFailure(memberHomeEvaluation);
      } else {
        const activeClub = activeClubForMode(context.context, "member");
        if (activeClub) return <MemberHome
          identity={identity}
          activeClub={activeClub}
          blessingIouEnabled={blessingIouEvaluation.enabled}
        />;
      }
    }
    return <RoleAwareDashboardLanding
      identity={identity}
      context={context.context}
      mode={resolved.resolution.mode}
    />;
  }

  return <ExperienceContextResolver context={context.context} requestedMode={resolved.resolution.mode} />;
}

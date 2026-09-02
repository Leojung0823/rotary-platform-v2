import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { LineOaOnboarding } from "@/components/line-oa-onboarding";
import { Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { activeClubForMode } from "@/lib/experience-context";
import {
  activeClubCookieName,
  readActiveClubPreference,
} from "@/lib/experience-context-cookie";
import { resolveExperienceContext } from "@/lib/experience-context.server";
import { resolveLineOaOnboardingStatus } from "@/lib/line/oa-onboarding.server";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";

export default async function MyLineOaPage() {
  const [identity, cookieStore] = await Promise.all([requireIdentity(), cookies()]);
  const preferredClubId = readActiveClubPreference(cookieStore.get(activeClubCookieName)?.value);
  const [evaluation, context] = await Promise.all([
    evaluateCurrentFeatureFlag({ key: "line_oa_onboarding_v1", subjectUuid: identity.id }),
    resolveExperienceContext(preferredClubId),
  ]);

  if (!evaluation.enabled) notFound();
  if (!context.ok && context.reason === "authorization_denied") redirect("/access-denied");
  if (!context.ok) return <Notice tone="error">目前無法載入您的扶輪社資料，請稍後重新整理。</Notice>;

  const activeClub = activeClubForMode(context.context, "member");
  const orderedClubs = [...context.context.memberClubs].sort((left, right) => {
    if (left.clubId === activeClub?.clubId) return -1;
    if (right.clubId === activeClub?.clubId) return 1;
    return left.clubName.localeCompare(right.clubName, "zh-Hant");
  });
  const resolutions = await Promise.all(
    orderedClubs.map((club) => resolveLineOaOnboardingStatus(club.clubId)),
  );
  const statuses = resolutions.flatMap((resolution) => resolution.ok ? [resolution.status] : []);

  return <div className="page-stack narrow">
    <header className="page-header">
      <div>
        <p className="eyebrow">會員中心</p>
        <h1>LINE 官方帳號</h1>
        <p>每個扶輪社有自己的官方帳號；這裡只顯示您目前仍有有效社籍的社。</p>
      </div>
    </header>

    {statuses.length === 0 ? <Notice>
      您的扶輪社尚未完成 LINE 官方帳號驗證，因此目前沒有可用的加入連結。
    </Notice> : statuses.map((status) => <LineOaOnboarding
      key={status.clubId}
      initialStatus={status}
      surface="profile"
    />)}
  </div>;
}

import { LineOaOnboarding } from "@/components/line-oa-onboarding";
import { resolveLineOaOnboardingStatus } from "@/lib/line/oa-onboarding.server";

export function MemberLineOaOnboardingLoading() {
  return <section className="skeleton-card" aria-busy="true" aria-live="polite">
    <span className="sr-only">正在載入本社 LINE 官方帳號狀態</span>
    <span className="skeleton skeleton-eyebrow" />
    <span className="skeleton skeleton-card-title" />
    <span className="skeleton skeleton-copy skeleton-copy-wide" />
    <span className="skeleton skeleton-action" />
  </section>;
}

export async function MemberLineOaOnboarding({ clubId }: { clubId: string }) {
  const resolution = await resolveLineOaOnboardingStatus(clubId);
  if (!resolution.ok || !resolution.status.oaAvailable) return null;
  return <LineOaOnboarding initialStatus={resolution.status} surface="home" />;
}

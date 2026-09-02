import { MemberLineOaOnboardingLoading } from "@/components/member-line-oa-onboarding";

export default function MyLineOaLoading() {
  return <div className="page-stack narrow">
    <div className="loading-heading" aria-hidden="true">
      <span className="skeleton skeleton-eyebrow" />
      <span className="skeleton skeleton-title" />
      <span className="skeleton skeleton-copy" />
    </div>
    <MemberLineOaOnboardingLoading />
  </div>;
}

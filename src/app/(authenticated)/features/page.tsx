import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import {
  productFeatureCategories,
  productFeaturePath,
  productFeatures,
} from "@/lib/product/features";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";

export default async function ProductFeaturesPage() {
  const identity = await requireIdentity();
  const gatedFeatures = productFeatures.filter((feature) => feature.featureFlagKey);
  const evaluations = await Promise.all(gatedFeatures.map(async (feature) => ({
    slug: feature.slug,
    evaluation: await evaluateCurrentFeatureFlag({
      key: feature.featureFlagKey!,
      subjectUuid: identity.id,
    }),
  })));
  const disabledSlugs = new Set(
    evaluations.filter(({ evaluation }) => !evaluation.enabled).map(({ slug }) => slug),
  );
  const visibleFeatures = productFeatures.filter((feature) => !disabledSlugs.has(feature.slug));
  const availableCount = visibleFeatures.filter((feature) => feature.status === "available").length;
  const developingCount = visibleFeatures.length - availableCount;

  return <div className="page-stack">
    <header className="page-header">
      <div>
        <p className="eyebrow">產品功能地圖</p>
        <h1>扶輪管理平台功能總覽</h1>
        <p>已可測試的功能會直接開啟；尚未完成的功能會明確標示「開發中」，不會偽裝成可操作功能。</p>
      </div>
      <Link className="button button-secondary" href="/dashboard">返回總覽</Link>
    </header>

    <div className="metric-grid">
      <Card>
        <span className="metric-label">目前可測試</span>
        <strong className="metric-value">{availableCount}</strong>
      </Card>
      <Card>
        <span className="metric-label">開發中</span>
        <strong className="metric-value">{developingCount}</strong>
      </Card>
    </div>

    <div className="notice notice-info">
      V0.7 優先順序：社員名冊與個人資料、邀請與登入完整流程、Hosted Supabase／HTTPS 測試站，以及行動版前端完善。
    </div>

    {productFeatureCategories.map((category) => {
      const features = visibleFeatures.filter((feature) => feature.category === category);
      return <section key={category}>
        <div className="section-heading">
          <h2>{category}</h2>
          <span>{features.length} 項</span>
        </div>
        <div className="club-grid">
          {features.map((feature) => <Link
            key={feature.slug}
            href={productFeaturePath(feature)}
            className="club-card"
          >
            <div>
              <span className="club-code">{feature.phase}</span>
              <h3>{feature.title}</h3>
              <p>{feature.summary}</p>
            </div>
            <Badge tone={feature.status === "available" ? "success" : "warning"}>
              {feature.status === "available" ? "可測試" : "開發中"}
            </Badge>
            <span className="card-link">
              {feature.status === "available" ? "開啟功能 →" : "查看開發範圍 →"}
            </span>
          </Link>)}
        </div>
      </section>;
    })}
  </div>;
}

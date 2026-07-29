import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import { findProductFeature } from "@/lib/product/features";

export default async function ProductFeatureStatusPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const feature = findProductFeature(slug);
  if (!feature) notFound();
  if (feature.status === "available" && feature.href) redirect(feature.href);

  return <div className="page-stack narrow">
    <header className="page-header">
      <div>
        <p className="eyebrow">{feature.phase}</p>
        <h1>{feature.title}</h1>
        <p>{feature.summary}</p>
      </div>
      <Badge tone="warning">開發中</Badge>
    </header>

    <Card>
      <h2>目前狀態</h2>
      <p>此入口已先放入正式資訊架構，讓使用者知道平台的完整方向；功能尚未完成，因此不會顯示假的表單、假資料或可誤按的操作。</p>
      <ol className="steps">
        <li className="done">功能名稱與位置已確定</li>
        <li className="current">流程、權限與資料模型開發中</li>
        <li>自動測試與安全驗證</li>
        <li>測試站實機操作</li>
        <li>明確核准後才正式上線</li>
      </ol>
    </Card>

    <div className="notice notice-info">
      這是開發狀態頁，不代表功能已上線，也不會修改 hosted、staging 或 production 資料。
    </div>

    <div className="form-actions">
      <Link className="button button-secondary" href="/features">返回功能總覽</Link>
      <Link className="button" href="/dashboard">回到工作台</Link>
    </div>
  </div>;
}

export default function Loading() {
  return <div className="page-stack" aria-busy="true" aria-live="polite">
    <span className="sr-only">正在載入社費與核銷資料</span>
    <div className="skeleton-card"><span className="skeleton skeleton-eyebrow" /><span className="skeleton skeleton-card-title" /><span className="skeleton skeleton-copy skeleton-copy-wide" /><span className="skeleton skeleton-copy" /></div>
    <div className="skeleton-card"><span className="skeleton skeleton-card-title" /><span className="skeleton skeleton-copy skeleton-copy-wide" /><span className="skeleton skeleton-copy" /></div>
  </div>;
}

import { Card } from "@/components/ui";

export default function MemberTasksLoading() {
  return <div className="page-stack" aria-busy="true" aria-label="待辦事項載入中">
    <header className="page-header"><div><p className="eyebrow">社員首頁 · 待辦事項</p><h1>我的待辦</h1><p>正在整理您需要處理的事項…</p></div></header>
    <Card><div className="skeleton" style={{ width: "40%", height: 32 }} /></Card>
    <Card><div className="skeleton" style={{ width: "100%", height: 280 }} /></Card>
  </div>;
}

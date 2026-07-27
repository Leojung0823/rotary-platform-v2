import { MessageBoard } from "@/components/message-board/message-board";
import { requireIdentity } from "@/lib/auth";

export default async function BoardPage() {
  await requireIdentity();
  return <div className="page-stack">
    <header className="page-header">
      <div>
        <p className="eyebrow">社員交流</p>
        <h1>留言板</h1>
        <p>分享近況、交流訊息，所有內容皆以純文字安全顯示。</p>
      </div>
    </header>
    <MessageBoard />
  </div>;
}

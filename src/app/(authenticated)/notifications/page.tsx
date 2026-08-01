import Link from "next/link";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/app/announcement-actions";
import { Badge, Card, EmptyState, Notice } from "@/components/ui";
import { formatAnnouncementTime, parseNotificationList } from "@/lib/announcements/projections";
import { requireIdentity } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  await requireIdentity(); const query = await searchParams; const supabase = await createClient();
  const result = await supabase.rpc("list_my_notifications", { p_cursor: null, p_limit: 100 });
  const notifications = result.error ? null : parseNotificationList(result.data);
  return <div className="page-stack"><header className="page-header"><div><p className="eyebrow">只屬於您的訊息</p><h1>通知中心</h1><p>通知不會顯示其他社員的收件或已讀狀態。</p></div><Link className="button button-secondary" href="/announcements">查看公告</Link></header>
    {query.success && <Notice tone="success">已更新已讀狀態。</Notice>}{query.error && <Notice tone="error">無法更新通知，請稍後再試。</Notice>}
    {notifications === null && <Notice tone="error">目前無法讀取通知。</Notice>}
    {notifications?.some((item) => !item.read_at) && <details className="card"><summary>全部標記為已讀</summary><p>此動作只會更新您自己的有效通知。</p><form action={markAllNotificationsReadAction}><input type="hidden" name="confirmation" value="yes" /><button className="button" type="submit">確認全部已讀</button></form></details>}
    {notifications?.length === 0 && <EmptyState title="沒有通知" body="公告發布後，符合受眾的通知會顯示在這裡。" />}
    {notifications && <div className="page-stack notification-list">{notifications.map((item) => <Card key={item.id}><div className="section-heading"><div><div className="status-pair">{!item.read_at && <Badge tone="success">未讀</Badge>}<Badge>{item.type}</Badge></div><h2>{item.title}</h2></div><span>{formatAnnouncementTime(item.created_at)}</span></div><p>{item.body}</p><div className="form-actions"><Link className="button button-secondary" href={item.action_path}>開啟</Link>{!item.read_at && <form action={markNotificationReadAction}><input type="hidden" name="notificationId" value={item.id} /><button className="button" type="submit">標記已讀</button></form>}</div></Card>)}</div>}
  </div>;
}

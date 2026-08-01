import Link from "next/link";
import { markAnnouncementReadAction } from "@/app/announcement-actions";
import { Badge, Card, Notice } from "@/components/ui";
import { formatAnnouncementTime, parseAnnouncementDetail } from "@/lib/announcements/projections";
import { requireIdentity } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AnnouncementDetailPage({ params, searchParams }: { params: Promise<{ announcementId: string }>; searchParams: Promise<{ clubId?: string; success?: string }> }) {
  await requireIdentity(); const { announcementId } = await params; const query = await searchParams;
  if (!query.clubId) return <Notice tone="error">缺少扶輪社識別，無法開啟公告。</Notice>;
  const supabase = await createClient();
  const result = await supabase.rpc("get_my_announcement", { p_club_id: query.clubId, p_announcement_id: announcementId });
  const announcement = result.error ? null : parseAnnouncementDetail(result.data);
  if (!announcement) return <div className="page-stack narrow"><Link className="back-link" href="/announcements">← 返回公告</Link><Notice tone="error">公告不存在、已失效或您沒有存取權。</Notice></div>;
  return <div className="page-stack narrow"><Link className="back-link" href={`/announcements?clubId=${announcement.club_id}`}>← 返回公告</Link>
    {query.success && <Notice tone="success">已標記為已讀。</Notice>}
    <Card><div className="status-pair">{!announcement.read_at && <Badge tone="success">未讀</Badge>}{announcement.pinned_until && new Date(announcement.pinned_until) > new Date() && <Badge tone="warning">置頂</Badge>}</div>
      <h1>{announcement.title}</h1><p className="hint">發布：{formatAnnouncementTime(announcement.published_at)}{announcement.expire_at && <> · 到期：{formatAnnouncementTime(announcement.expire_at)}</>}</p>
      <div className="announcement-body">{announcement.body.split("\n").map((line, index) => <p key={index}>{line || <br />}</p>)}</div>
      {!announcement.read_at && <form action={markAnnouncementReadAction}><input type="hidden" name="clubId" value={announcement.club_id} /><input type="hidden" name="announcementId" value={announcement.id} /><button className="button" type="submit">標記已讀</button></form>}
    </Card>
  </div>;
}

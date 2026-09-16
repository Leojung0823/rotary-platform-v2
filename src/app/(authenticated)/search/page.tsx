import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, Input, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { resolveExperienceContext } from "@/lib/experience-context.server";
import { parseClubSearchResults } from "@/lib/search/results";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "搜尋" };

const publishedOn = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
});

// A result line needs when it starts, not how long it runs -- the event's own
// page is one tap away for that.
const startedOn = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  hour: "2-digit", minute: "2-digit", hour12: false,
});

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [, query] = await Promise.all([requireIdentity(), searchParams]);
  const needle = (query.q ?? "").trim();
  const resolution = await resolveExperienceContext(null);
  const activeClubId = resolution.ok ? resolution.context.activeClubId : null;

  const form = <form action="/search" className="inline-form" method="get" role="search">
    <Input aria-label="搜尋活動、社員或訊息" defaultValue={needle} name="q" placeholder="搜尋活動、社員或訊息" />
    <button className="button" type="submit">搜尋</button>
  </form>;

  const header = <header className="page-header">
    <div>
      <p className="eyebrow">搜尋</p>
      <h1>搜尋結果</h1>
      <p>只會找到您本來就看得到的內容：分眾活動、其他社的資料與別人的訊息都不會出現。</p>
    </div>
  </header>;

  if (!activeClubId) {
    return <div className="page-stack">{header}{form}
      <Notice tone="error">目前沒有有效社籍，無法搜尋。</Notice>
    </div>;
  }

  if (needle.length < 2) {
    return <div className="page-stack">{header}{form}
      <EmptyState title="請輸入兩個字以上" body="一個字會找到大半個社，等於沒有回答。" />
    </div>;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_my_club", {
    p_club_id: activeClubId,
    p_query: needle,
    p_limit: 10,
  });
  if (error) {
    return <div className="page-stack">{header}{form}
      <Notice tone="error">目前無法搜尋，請稍後再試。</Notice>
    </div>;
  }

  // A projection that does not parse is not rendered as an empty result: the
  // difference between "nothing matched" and "something went wrong" is the
  // whole answer here.
  const results = parseClubSearchResults(data);
  if (results === null) {
    return <div className="page-stack">{header}{form}
      <Notice tone="error">搜尋結果的格式無法辨識，請稍後再試。</Notice>
    </div>;
  }

  const total = results.events.length + results.members.length + results.messages.length;

  return <div className="page-stack">
    {header}
    {form}

    {total === 0
      ? <EmptyState title={`找不到「${needle}」`} body="換個關鍵字試試，或確認這是您看得到的內容。" />
      : <>
        {results.events.length > 0 && <Card>
          <div className="section-heading">
            <div><p className="eyebrow">活動</p><h2>{results.events.length} 場相符</h2></div>
          </div>
          <ul className="activity-list">
            {results.events.map((event) => <li key={event.id}>
              <Link href={`/events/${encodeURIComponent(event.id)}`} prefetch={false}>{event.title}</Link>
              <span className="subtle">
                {startedOn.format(new Date(event.startsAt))}
                {event.location ? ` · ${event.location}` : ""}
              </span>
            </li>)}
          </ul>
        </Card>}

        {results.members.length > 0 && <Card>
          <div className="section-heading">
            <div><p className="eyebrow">社員</p><h2>{results.members.length} 位相符</h2></div>
          </div>
          <ul className="activity-list">
            {results.members.map((member) => <li key={member.membershipId}>
              <Link href="/directory" prefetch={false}>{member.displayName}</Link>
              <span className="subtle">{member.occupation || "—"}</span>
            </li>)}
          </ul>
        </Card>}

        {results.messages.length > 0 && <Card>
          <div className="section-heading">
            <div><p className="eyebrow">社內訊息</p><h2>{results.messages.length} 則相符</h2></div>
          </div>
          <ul className="activity-list">
            {results.messages.map((message) => <li key={message.id}>
              <Link href="/messages" prefetch={false}>{message.title}</Link>
              <span className="subtle">
                {message.unread && <Badge tone="warning">未讀</Badge>}
                {" "}{publishedOn.format(new Date(message.publishedAt))}
              </span>
            </li>)}
          </ul>
        </Card>}
      </>}
  </div>;
}

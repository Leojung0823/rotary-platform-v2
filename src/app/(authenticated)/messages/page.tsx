import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCenter } from "@/components/message-center/message-center";
import { requireIdentity } from "@/lib/auth";
import {
  parseClubMessageInbox,
  parseSentClubMessages,
  type SentClubMessage,
} from "@/lib/message-center/contracts";
import { encodeMessageCursor } from "@/lib/message-center/validation";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { createClient } from "@/lib/supabase/server";
import type { MemberRow } from "../clubs/[clubId]/members/page";

type MessageClub = {
  club_id: string;
  club_code: string;
  club_name: string;
};

function isMessageClub(value: unknown): value is MessageClub {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const club = value as Record<string, unknown>;
  return typeof club.club_id === "string"
    && typeof club.club_code === "string"
    && typeof club.club_name === "string";
}

function MessageHeader() {
  return <header className="page-header">
    <div>
      <p className="eyebrow">社內通知</p>
      <h1>訊息中心</h1>
      <p>幹部發布的訊息會送到這裡，不需要加入 LINE 官方帳號也收得到。每個扶輪社的訊息彼此隔離。</p>
    </div>
  </header>;
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ clubId?: string }>;
}) {
  const [identity, query] = await Promise.all([requireIdentity(), searchParams]);
  const evaluation = await evaluateCurrentFeatureFlag({
    key: "announcements_v09",
    subjectUuid: identity.id,
  });
  if (!evaluation.enabled) notFound();

  const supabase = await createClient();
  // The board asked this same question first: which clubs is this account an
  // active member of. Reused rather than redefined so the two inboxes can
  // never disagree about who belongs where.
  const { data, error } = await supabase.rpc("list_my_board_clubs");
  const rows = data ?? [];

  if (error || !Array.isArray(rows) || !rows.every(isMessageClub)) {
    return <div className="page-stack">
      <MessageHeader />
      <div className="empty-state" role="alert">
        <h2>無法載入訊息中心</h2>
        <p>目前無法確認您的社籍，請稍後重新整理。系統不會把權限或資料庫錯誤當成沒有訊息。</p>
      </div>
    </div>;
  }

  const clubs = rows;
  const selectedClub = clubs.find((club) => club.club_id === query.clubId) ?? clubs[0] ?? null;

  if (!selectedClub) {
    return <div className="page-stack">
      <MessageHeader />
      <div className="empty-state">
        <h2>目前沒有可使用的訊息中心</h2>
        <p>只有啟用中的扶輪社與有效社員身分會顯示在這裡。</p>
      </div>
    </div>;
  }

  // Independent reads, so they are issued together: on the free Render plan a
  // sequential round trip costs about 180ms each.
  const [inboxResult, permissionsResult] = await Promise.all([
    supabase.rpc("list_my_club_messages", { p_club_id: selectedClub.club_id, p_limit: 20 }),
    supabase.rpc("list_my_permissions", { p_club_id: selectedClub.club_id }),
  ]);

  if (inboxResult.error) {
    return <div className="page-stack">
      <MessageHeader />
      <div className="empty-state" role="alert">
        <h2>無法載入訊息</h2>
        <p>請稍後重新整理。看不到訊息不代表沒有訊息。</p>
      </div>
    </div>;
  }

  let inbox;
  try {
    inbox = parseClubMessageInbox(inboxResult.data);
  } catch {
    inbox = { messages: [], unreadCount: 0, nextCursorPayload: null };
  }

  const canSend = !permissionsResult.error
    && ((permissionsResult.data ?? []) as { permission_key: string }[])
      .some((permission) => permission.permission_key === "member.manage");

  let audienceTags: { tag_id: string; tag_name: string; member_count: number }[] = [];
  let audienceMembers: { membership_id: string; display_name: string }[] = [];
  let sent: SentClubMessage[] = [];
  if (canSend) {
    const [tagsResult, membersResult, sentResult] = await Promise.all([
      supabase.rpc("list_club_member_tags", { p_club_id: selectedClub.club_id }),
      supabase.rpc("list_club_members", {
        p_club_id: selectedClub.club_id,
        p_query: null,
        p_status: "active",
      }),
      supabase.rpc("list_club_sent_messages", { p_club_id: selectedClub.club_id, p_limit: 20 }),
    ]);
    if (!tagsResult.error) {
      audienceTags = ((tagsResult.data as { tags?: typeof audienceTags } | null)?.tags ?? []);
    }
    if (!membersResult.error) {
      audienceMembers = ((membersResult.data ?? []) as MemberRow[]).map((member) => ({
        membership_id: member.membership_id,
        display_name: member.display_name,
      }));
    }
    try {
      sent = sentResult.error ? [] : parseSentClubMessages(sentResult.data);
    } catch {
      sent = [];
    }
  }

  return <div className="page-stack">
    <MessageHeader />

    {clubs.length > 1 && <section>
      <div className="section-heading"><h2>選擇扶輪社</h2></div>
      <div className="club-grid">
        {clubs.map((club) => <Link
          key={club.club_id}
          href={`/messages?clubId=${encodeURIComponent(club.club_id)}`}
          className="club-card"
          aria-current={selectedClub.club_id === club.club_id ? "page" : undefined}
        >
          <div><span className="club-code">{club.club_code}</span><h3>{club.club_name}</h3></div>
          <span className="card-link">{selectedClub.club_id === club.club_id ? "目前顯示" : "開啟訊息中心 →"}</span>
        </Link>)}
      </div>
    </section>}

    <MessageCenter
      clubId={selectedClub.club_id}
      initialInbox={{
        messages: inbox.messages,
        unread_count: inbox.unreadCount,
        next_cursor: encodeMessageCursor(inbox.nextCursorPayload),
      }}
      canSend={canSend}
      audienceTags={audienceTags}
      audienceMembers={audienceMembers}
      initialSent={sent}
    />
  </div>;
}

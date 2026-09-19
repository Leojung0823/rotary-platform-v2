import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EventManagementPanel, type EventManagementAudienceMember, type EventManagementAudienceTag } from "@/components/events/event-management-panel";
import { Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { isEventClub, parseEvents } from "@/lib/events/page-contract";
import { parseRegistrationRoster } from "@/lib/events/registration-roster";
import { signCoverImageUrls } from "@/lib/events/cover-image.server";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const successMessages: Record<string, string> = {
  event_created: "活動草稿已建立，確認內容後即可發布。",
  event_published: "活動已發布，社員現在可以報名。",
  event_published_line_failed:
    "活動已發布，社員現在可以報名；但 LINE 推播沒有成功，請到 LINE OA 的推播紀錄確認。",
  event_cancelled: "活動已取消並留下稽核紀錄。",
  registration_set: "已代為更新報名狀態，並留下稽核紀錄。",
};

const errorMessages: Record<string, string> = {
  invalid_input: "輸入內容不完整或格式不正確。",
  reason_required: "代為更新報名時必須寫下原因，最多 200 字。",
  registration_failed: "無法更新這位社員的報名狀態。",
  cannot_publish: "活動目前不能發布，請確認開始與截止時間。",
  forbidden: "目前帳號沒有執行此動作的權限。",
  retryable: "取消活動等待資料庫鎖定超過安全時間，資料沒有當作成功；請重新整理後再試一次。",
  unexpected: "目前無法完成操作，請稍後再試。",
};

export default async function EventManagementPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ mode?: string; success?: string; error?: string; detail?: string }>;
}) {
  const [, { clubId }, query] = await Promise.all([requireIdentity(), params, searchParams]);
  if (!uuidPattern.test(clubId)) notFound();
  if (query.mode !== "management") {
    redirect(`/clubs/${encodeURIComponent(clubId)}/events?mode=management`);
  }

  const supabase = await createClient();
  // Management asks the same canonical projection as the old events page, but
  // with the explicit manager view. The RPC still decides tenant access and
  // event visibility; this route only chooses which UI to render.
  const pageResult = await supabase.rpc("list_my_event_page", {
    p_club_id: clubId,
    p_as_member: false,
  });
  const projection = pageResult.data && typeof pageResult.data === "object" && !Array.isArray(pageResult.data)
    ? pageResult.data as { clubs?: unknown; selected_club_id?: unknown; events?: unknown }
    : null;
  const clubRows = projection && Array.isArray(projection.clubs) ? projection.clubs : null;
  if (pageResult.error?.code === "42501") redirect("/access-denied");
  if (pageResult.error || !clubRows || !clubRows.every(isEventClub)) {
    return <div className="page-stack">
      <header className="page-header">
        <div><p className="eyebrow">活動 · 社務管理</p><h1>活動管理</h1></div>
        <a className="button button-secondary" href={`/events?clubId=${encodeURIComponent(clubId)}&mode=member`}>返回社員頁</a>
      </header>
      <Notice tone="error">目前無法確認活動社別與管理權限，請稍後重新整理。</Notice>
    </div>;
  }

  const selectedClub = clubRows.find((club) => club.club_id.toLowerCase() === clubId.toLowerCase()) ?? null;
  const selectedClubId = projection && typeof projection.selected_club_id === "string"
    ? projection.selected_club_id
    : null;
  const events = projection ? parseEvents({ events: projection.events }) : null;
  if (selectedClubId?.toLowerCase() !== clubId.toLowerCase() || !selectedClub?.can_manage) redirect("/access-denied");
  if (!events) {
    return <div className="page-stack">
      <header className="page-header">
        <div><p className="eyebrow">{selectedClub.club_code} · 社務管理</p><h1>活動管理</h1></div>
      </header>
      <Notice tone="error">活動資料格式不完整，系統已停止顯示。</Notice>
    </div>;
  }

  const tagsPromise = supabase.rpc("list_club_member_tags", { p_club_id: selectedClub.club_id });
  const membersPromise = supabase.rpc("list_club_members", {
    p_club_id: selectedClub.club_id,
    p_query: null,
    p_status: "active",
  });
  const coverUrlsPromise = signCoverImageUrls(events.map((event) => event.cover_image_path));
  // One request per published event, issued together. Only published events
  // have anyone to list, and a draft's roster would be a list of people who
  // have not been asked yet.
  const rosterEvents = events.filter((event) => event.status === "published");
  const rostersPromise = Promise.all(rosterEvents.map(async (event) => {
    const { data, error } = await supabase.rpc("list_club_event_registrations", {
      p_club_id: selectedClub.club_id,
      p_event_id: event.id,
    });
    // A read that failed is not an empty roster: the component says so rather
    // than showing "nobody has registered".
    return [event.id, error ? null : parseRegistrationRoster(data)] as const;
  }));
  const [tagsResult, membersResult, coverUrls, rosterEntries] = await Promise.all([
    tagsPromise,
    membersPromise,
    coverUrlsPromise,
    rostersPromise,
  ]);
  const rosters = new Map(rosterEntries);
  const audienceTags = ((tagsResult.data as { tags?: EventManagementAudienceTag[] } | null)?.tags ?? []);
  const audienceMembers = ((membersResult.data ?? []) as EventManagementAudienceMember[])
    .map((member) => ({ membership_id: member.membership_id, display_name: member.display_name }));

  return <div className="page-stack">
    <header className="page-header">
      <div>
        <p className="eyebrow">{selectedClub.club_code} · 社務管理</p>
        <h1>活動管理</h1>
        <p>{selectedClub.club_name}的活動草稿、發布、封面與簽到入口。</p>
      </div>
      <div className="form-actions">
        <a className="button button-secondary" href={`/events?clubId=${encodeURIComponent(selectedClub.club_id)}&mode=member`}>查看社員頁</a>
        <Link className="button button-secondary" href="/dashboard?mode=management">返回社務總覽</Link>
      </div>
    </header>
    {query.success && successMessages[query.success] && <Notice tone="success">{successMessages[query.success]}</Notice>}
    {query.error && <Notice tone="error">
      {errorMessages[query.error] ?? errorMessages.unexpected}
      {/* The RPC's own words when it has some: "名額已滿" is actionable in a
          way that "無法更新" is not. */}
      {query.detail && ` ${query.detail}`}
    </Notice>}
    <EventManagementPanel
      selectedClub={selectedClub}
      events={events}
      coverUrls={coverUrls}
      audienceTags={audienceTags}
      audienceMembers={audienceMembers}
      rosters={rosters}
    />
  </div>;
}

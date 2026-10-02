import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { JoyWall } from "@/components/joy-wall/joy-wall";
import { EmptyState, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { activeClubCookieName, readActiveClubPreference } from "@/lib/experience-context-cookie";
import { readClubPermissions } from "@/lib/club-permissions.server";
import { parseJoyAudienceMembers, parseJoyPost, parseJoyPosts, type JoyPost } from "@/lib/joy-wall/contracts";
import { encodeJoyCursor, parseJoyPostId } from "@/lib/joy-wall/validation";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { createClient } from "@/lib/supabase/server";
import styles from "./joy-wall-page.module.css";

type JoyClub = { club_id: string; club_code: string; club_name: string };
function isJoyClub(value: unknown): value is JoyClub {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.club_id === "string" && typeof row.club_code === "string" && typeof row.club_name === "string";
}

export default async function JoyWallPage({
  searchParams,
}: {
  searchParams: Promise<{ clubId?: string; mode?: string; focusIouId?: string; focusPostId?: string }>;
}) {
  const identity = await requireIdentity();
  const evaluation = await evaluateCurrentFeatureFlag({ key: "joy_wall_v1", subjectUuid: identity.id });
  if (!evaluation.enabled) notFound();

  const [supabase, query, cookieStore] = await Promise.all([createClient(), searchParams, cookies()]);
  const { data: clubRows, error: clubsError } = await supabase.rpc("list_my_joy_clubs");
  if (clubsError || !Array.isArray(clubRows) || !clubRows.every(isJoyClub)) {
    return <div className="page-stack">
      <header className="page-header"><div><p className="eyebrow">社員交流</p><h1>歡喜牆</h1></div></header>
      <Notice tone="error">目前無法確認您的社籍，歡喜牆暫時無法載入。</Notice>
    </div>;
  }

  const clubs = clubRows;
  const cookieClubId = readActiveClubPreference(cookieStore.get(activeClubCookieName)?.value);
  const selectedClub = clubs.find((club) => club.club_id === query.clubId)
    ?? clubs.find((club) => club.club_id === cookieClubId)
    ?? clubs[0]
    ?? null;
  let focusIouId: string | null = null;
  if (query.focusIouId) {
    try { focusIouId = parseJoyPostId(query.focusIouId); } catch { /* An invalid focus is treated like a normal wall visit. */ }
  }
  let focusPostId: string | null = null;
  if (query.focusPostId) {
    try { focusPostId = parseJoyPostId(query.focusPostId); } catch { /* An invalid focus is treated like a normal wall visit. */ }
  }

  return <div className="page-stack">
    <header className={styles.header}>
      <div>
        <p className="eyebrow">社員交流</p>
        <h1>歡喜牆</h1>
        <p>把祝福、感謝、迎新和回憶留在社內。內容只會依您選的對象顯示，不會公開到社外。</p>
      </div>
    </header>
    {!selectedClub
      ? <EmptyState title="目前沒有可使用歡喜牆的扶輪社" body="請先確認自己在社內有有效社員身分。" />
      : await renderSelectedWall(supabase, selectedClub, query.mode, focusIouId, focusPostId)}
  </div>;
}

async function renderSelectedWall(
  supabase: Awaited<ReturnType<typeof createClient>>,
  selectedClub: JoyClub,
  mode?: string,
  focusIouId: string | null = null,
  focusPostId: string | null = null,
) {
  const focusedPostPromise = focusIouId
    ? supabase.rpc("get_my_joy_iou_post", { p_club_id: selectedClub.club_id, p_post_id: focusIouId })
    : focusPostId
      ? supabase.rpc("get_my_joy_question_post", { p_club_id: selectedClub.club_id, p_post_id: focusPostId })
      : Promise.resolve({ data: null, error: null });
  const [postsResult, audienceResult, permissionResult, focusedPostResult] = await Promise.all([
    supabase.rpc("list_joy_posts", {
      p_club_id: selectedClub.club_id,
      p_cursor_created_at: null,
      p_cursor_id: null,
      p_limit: 20,
    }),
    supabase.rpc("list_joy_member_options", { p_club_id: selectedClub.club_id }),
    readClubPermissions(selectedClub.club_id),
    focusedPostPromise,
  ]);
  if (postsResult.error) {
    return <Notice tone="error">歡喜牆內容目前無法載入，請稍後再試。</Notice>;
  }
  try {
    const page = parseJoyPosts(postsResult.data);
    const audienceMembers = audienceResult.error ? [] : parseJoyAudienceMembers(audienceResult.data);
    const canModerate = permissionResult.ok && permissionResult.permissions.includes("joy.moderate");
    let focusedPost: JoyPost | null = null;
    if (!focusedPostResult.error && focusedPostResult.data) {
      try {
        const parsed = parseJoyPost(focusedPostResult.data);
        if (focusIouId && parsed.post_type === "iou" && parsed.id === focusIouId) focusedPost = parsed;
        if (focusPostId && parsed.post_type === "question" && parsed.can_answer && parsed.id === focusPostId) {
          focusedPost = parsed;
        }
      } catch { /* Invalid or no-longer-actionable focus stays private and unavailable. */ }
    }
    const initialPosts = focusedPost
      ? [focusedPost, ...page.posts.filter((post) => post.id !== focusedPost?.id)]
      : page.posts;
    return <>
      <section className={styles.clubHeading}>
        <div><p className="eyebrow">{selectedClub.club_code}</p><h2>{selectedClub.club_name}</h2></div>
        {canModerate && mode === "management" && (
          <Link className="button button-secondary" href={`/clubs/${encodeURIComponent(selectedClub.club_id)}/joy/moderation?mode=management`}>
            管理檢舉
          </Link>
        )}
      </section>
      {(focusIouId || focusPostId) && !focusedPost && <Notice tone="info">
        這則內容已更新或目前無法查看；您仍可在下方瀏覽歡喜牆。
      </Notice>}
      <JoyWall
        clubId={selectedClub.club_id}
        audienceMembers={audienceMembers}
        initialPosts={initialPosts}
        initialCursor={encodeJoyCursor(page.nextCursor)}
        focusedPostId={focusedPost?.id ?? null}
      />
    </>;
  } catch {
    return <Notice tone="error">歡喜牆資料格式不完整，為保護隱私目前不顯示內容。</Notice>;
  }
}

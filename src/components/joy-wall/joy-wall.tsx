"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  JoyAudienceMember,
  JoyCommentType,
  JoyIouProjection,
  JoyPost,
  JoyPostDraft,
  JoyPostType,
  JoyReactionType,
  JoyReportReason,
  JoyTargetOptions,
  JoyVisibilityScope,
} from "@/lib/joy-wall/contracts";
import type { JoyIouAction } from "@/lib/joy-wall/validation";
import {
  joyCommentTypes,
  joyCreatablePostTypes,
  joyPostTypes,
  joyReactionTypes,
  joyReportReasons,
  parseJoyComment,
  parseJoyComments,
  parseJoyPost,
  parseJoyPostDraft,
} from "@/lib/joy-wall/contracts";
import type { JoyComment } from "@/lib/joy-wall/contracts";
import { JOY_COMMENT_MAX_CODE_POINTS, JOY_POST_MAX_CODE_POINTS } from "@/lib/joy-wall/validation";
import { APP_TIME_ZONE } from "@/lib/time";
import styles from "./joy-wall.module.css";

type JoyWallProps = {
  clubId: string;
  audienceMembers: readonly JoyAudienceMember[];
  targetOptions: JoyTargetOptions;
  targetOptionsUnavailable: boolean;
  initialDrafts: readonly JoyPostDraft[];
  draftsUnavailable: boolean;
  initialPosts: readonly JoyPost[];
  initialPinnedPosts: readonly JoyPost[];
  pinnedPostsUnavailable: boolean;
  canManagePublicPosts: boolean;
  initialCursor: string | null;
  focusedPostId: string | null;
};
type Envelope<T> = { data?: T; error?: string };
type CommentState = { items: JoyComment[]; loaded: boolean };
type EditingDraft = { postType: JoyPostType; title: string; content: string; interactionDeadlineOn: string | null };

const postTypeLabels: Record<JoyPostType, string> = {
  blessing: "祝福",
  gratitude: "感謝",
  welcome: "迎新",
  encouragement: "加油打氣",
  memory: "活動回憶",
  question: "提問交流",
  other: "其他分享",
  iou: "非現金承諾",
};
const commentTypeLabels: Record<JoyCommentType, string> = {
  comment: "留言",
  blessing: "祝福",
  encouragement: "鼓勵",
  question: "提問",
  answer: "回答",
};
const reactionLabels: Record<JoyReactionType, string> = {
  heart: "❤️ 喜歡",
  thanks: "🙏 感謝",
  celebrate: "🎉 歡喜",
  support: "💪 支持",
  laugh: "😄 會心一笑",
};
const reportLabels: Record<JoyReportReason, string> = {
  spam: "垃圾內容",
  harassment: "騷擾或攻擊",
  privacy: "涉及隱私",
  inappropriate: "不適當內容",
  other: "其他原因",
  recipient_hide_request: "收件人要求隱藏",
};
const scopeLabels: Record<JoyVisibilityScope, string> = {
  club: "全社社員可見",
  selected: "只限指定社員",
  private: "只限自己與一位社員",
};

class JoyRequestError extends Error {}

async function readData<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as Envelope<T> | null;
  if (!response.ok || !payload || !("data" in payload)) {
    throw new JoyRequestError(payload?.error ?? "request_failed");
  }
  return payload.data as T;
}

function requestFailureMessage(error: unknown, fallback: string) {
  if (!(error instanceof JoyRequestError)) return fallback;
  if (error.message === "rate_limited") return "操作太頻繁，請稍候再試。";
  if (error.message === "interactions_closed") return "這則分享已截止留言／回答；原有內容仍可閱讀。";
  if (error.message === "pin_limit_reached") return "最多可置頂 5 則分享；請先取消一則置頂，再試一次。";
  if (error.message === "pin_not_eligible") return "只能置頂已發布的全社分享；指定對象、私人分享與 IOU 不適用。";
  return fallback;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "時間未知";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: APP_TIME_ZONE, month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

function safeAvatarUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch { return null; }
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  const url = safeAvatarUrl(avatarUrl);
  return <span className={styles.avatar} aria-hidden="true">
    <span>{name.trim().slice(0, 1) || "？"}</span>
    {url && !failed && <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
  </span>;
}

function endpoint(clubId: string, path = "") {
  const query = new URLSearchParams({ club_id: clubId });
  return `/api/v1/joy${path}?${query.toString()}`;
}

function todayInTaiwan() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function iouStatusLabel(iou: JoyIouProjection) {
  if (iou.is_overdue) return "已逾期";
  if (iou.status === "proposed") return iou.viewer_role === "promisor" ? "等待對方回覆" : "等待你回覆";
  if (iou.status === "accepted") return iou.viewer_role === "promisor" ? "對方已答應，等待開始" : "你已答應，等待提出者開始";
  if (iou.status === "declined") return iou.viewer_role === "promisor" ? "對方婉拒" : "你已婉拒";
  if (iou.status === "in_progress") return "履行中";
  if (iou.status === "completed") return "雙方已確認完成";
  return "已取消";
}

function formatDueDate(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: APP_TIME_ZONE, year: "numeric", month: "long", day: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

function defaultCommentType(post: JoyPost): JoyCommentType {
  return post.post_type === "question" && post.can_answer ? "answer" : "comment";
}

export function JoyWall({
  clubId, audienceMembers, targetOptions, targetOptionsUnavailable, initialDrafts, draftsUnavailable,
  initialPosts, initialPinnedPosts, pinnedPostsUnavailable, canManagePublicPosts, initialCursor, focusedPostId,
}: JoyWallProps) {
  const [posts, setPosts] = useState([...initialPosts]);
  const [pinnedPosts, setPinnedPosts] = useState([...initialPinnedPosts]);
  const [cursor, setCursor] = useState(initialCursor);
  const [favoritePosts, setFavoritePosts] = useState<JoyPost[]>([]);
  const [favoriteCursor, setFavoriteCursor] = useState<string | null>(null);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [postType, setPostType] = useState<JoyPostType>("blessing");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [interactionDeadlineOn, setInteractionDeadlineOn] = useState("");
  const [visibilityScope, setVisibilityScope] = useState<JoyVisibilityScope>("club");
  const [audienceIds, setAudienceIds] = useState<string[]>([]);
  const [targetEventIds, setTargetEventIds] = useState<string[]>([]);
  const [targetRotaryYearIds, setTargetRotaryYearIds] = useState<string[]>([]);
  const [targetRoleKeys, setTargetRoleKeys] = useState<string[]>([]);
  const [targetBirthdayCampaignIds, setTargetBirthdayCampaignIds] = useState<string[]>([]);
  const [iouRecipientId, setIouRecipientId] = useState("");
  const [iouDueOn, setIouDueOn] = useState("");
  const [iouNotes, setIouNotes] = useState<Record<string, string>>({});
  const [publishing, setPublishing] = useState(false);
  const [drafts, setDrafts] = useState([...initialDrafts]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [stateMessage, setStateMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<JoyPostType | "all">("all");
  const [comments, setComments] = useState<Record<string, CommentState>>({});
  const [commentsOpen, setCommentsOpen] = useState<Record<string, boolean>>(() =>
    focusedPostId ? { [focusedPostId]: true } : {},
  );
  const [focusedCommentsErrorId, setFocusedCommentsErrorId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [commentTypes, setCommentTypes] = useState<Record<string, JoyCommentType>>({});
  const [replyTo, setReplyTo] = useState<{ postId: string; commentId: string } | null>(null);
  const [commentLoadingId, setCommentLoadingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<EditingDraft | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<JoyReportReason>("inappropriate");
  const [reportedIds, setReportedIds] = useState<string[]>([]);
  const [hideRequestingId, setHideRequestingId] = useState<string | null>(null);

  const activePosts = showFavorites ? favoritePosts : posts;
  const activeCursor = showFavorites ? favoriteCursor : cursor;
  const visiblePosts = useMemo(() => filter === "all" ? activePosts : activePosts.filter((post) => post.post_type === filter), [activePosts, filter]);
  const feedPosts = useMemo(() => {
    if (showFavorites || filter !== "all") return visiblePosts;
    const pinnedIds = new Set(pinnedPosts.map((post) => post.id));
    return [...pinnedPosts, ...visiblePosts.filter((post) => !pinnedIds.has(post.id))];
  }, [filter, pinnedPosts, showFavorites, visiblePosts]);
  const audienceCount = audienceIds.length;
  const contentLength = Array.from(content).length;
  const focusedQuestionId = initialPosts.find((post) =>
    post.id === focusedPostId && post.post_type === "question" && post.can_answer,
  )?.id ?? null;
  const audienceValid = postType === "iou" ? Boolean(iouRecipientId)
    : visibilityScope === "club" ? audienceCount === 0
      : visibilityScope === "selected" ? audienceCount > 0 && audienceCount <= 25 : audienceCount === 1;

  useEffect(() => {
    if (!focusedPostId) return;
    document.getElementById(`joy-post-${focusedPostId}`)?.scrollIntoView({ block: "start" });
    const focusedPost = initialPosts.find((post) => post.id === focusedPostId);
    if (focusedPost?.post_type !== "question" || !focusedPost.can_answer) return;

    if (comments[focusedPostId]?.loaded) return;

    const controller = new AbortController();
    void fetch(endpoint(clubId, `/posts/${encodeURIComponent(focusedPostId)}/comments`), {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => readData<unknown>(response))
      .then((value) => parseJoyComments(value))
      .then((items) => setComments((current) => ({
        ...current,
        [focusedPostId]: { items, loaded: true },
      })))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setFocusedCommentsErrorId(focusedPostId);
          setStateMessage(requestFailureMessage(error, "提問回覆目前無法載入，請稍後再試。"));
        }
      });
    return () => controller.abort();
  }, [clubId, comments, focusedPostId, initialPosts]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (contentLength < 1 || contentLength > JOY_POST_MAX_CODE_POINTS || !audienceValid) {
      setStateMessage(postType === "iou" ? "請選擇一位社員，並填寫承諾內容。" : "請檢查分享內容與閱讀對象。私人分享要選一位社員；指定社員分享至少選一位。");
      return;
    }
    setPublishing(true);
    setStateMessage(null);
    try {
      const isIou = postType === "iou";
      let response: Response;
      if (activeDraftId && !isIou) {
        const savedDraftResponse = await fetch(endpoint(clubId, "/drafts"), {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draftPayload(activeDraftId)),
        });
        const savedDraft = parseJoyPostDraft(await readData<unknown>(savedDraftResponse));
        setDrafts((current) => current.map((draft) => draft.id === savedDraft.id ? savedDraft : draft));
        response = await fetch(endpoint(clubId, `/drafts/${encodeURIComponent(activeDraftId)}/publish`), { method: "POST" });
      } else {
        response = await fetch(endpoint(clubId, isIou ? "/ious" : "/posts"), {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(isIou
            ? { recipientMembershipId: iouRecipientId, title: title.trim() || null, content, dueOn: iouDueOn || null }
            : {
              postType, title: title.trim() || null, content, visibilityScope,
              audienceMembershipIds: audienceIds,
              eventIds: targetEventIds,
              rotaryYearIds: targetRotaryYearIds,
              roleKeys: targetRoleKeys,
              birthdayCampaignIds: targetBirthdayCampaignIds,
              interactionDeadlineOn: interactionDeadlineOn || null,
            }),
        });
      }
      const post = parseJoyPost(await readData<unknown>(response));
      setPosts((current) => [post, ...current]);
      if (activeDraftId) {
        setDrafts((current) => current.filter((draft) => draft.id !== activeDraftId));
        setActiveDraftId(null);
      }
      setShowFavorites(false);
      setFilter("all");
      setPostType("blessing"); setTitle(""); setContent(""); setVisibilityScope("club"); setAudienceIds([]);
      setInteractionDeadlineOn("");
      setTargetEventIds([]); setTargetRotaryYearIds([]); setTargetRoleKeys([]); setTargetBirthdayCampaignIds([]);
      setIouRecipientId(""); setIouDueOn("");
      setStateMessage(isIou ? "非現金承諾已送出，只有你和指定社員看得到。" : "已分享。內容只會提供給您選擇的對象。");
    } catch (error) {
      setStateMessage(requestFailureMessage(error, "這次沒有送出，請稍後再試；原本內容仍保留在表單裡。"));
    } finally { setPublishing(false); }
  }

  function draftPayload(draftId: string) {
    return {
      draftId, postType, title: title.trim() || null, content, visibilityScope,
      interactionDeadlineOn: interactionDeadlineOn || null,
      audienceMembershipIds: audienceIds,
      eventIds: targetEventIds,
      rotaryYearIds: targetRotaryYearIds,
      roleKeys: targetRoleKeys,
      birthdayCampaignIds: targetBirthdayCampaignIds,
    };
  }

  async function saveDraft() {
    if (postType === "iou" || contentLength > JOY_POST_MAX_CODE_POINTS) return;
    const draftId = activeDraftId ?? crypto.randomUUID();
    setPublishing(true);
    setStateMessage(null);
    try {
      const response = await fetch(endpoint(clubId, "/drafts"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftPayload(draftId)),
      });
      const savedDraft = parseJoyPostDraft(await readData<unknown>(response));
      setDrafts((current) => current.some((draft) => draft.id === savedDraft.id)
        ? current.map((draft) => draft.id === savedDraft.id ? savedDraft : draft)
        : [savedDraft, ...current]);
      setActiveDraftId(savedDraft.id);
      setStateMessage("草稿已儲存，只有你看得到；要發布時再按「分享」。");
    } catch (error) {
      setStateMessage(requestFailureMessage(error, "草稿沒有儲存，請稍後再試；內容仍留在表單裡。"));
    } finally { setPublishing(false); }
  }

  function resumeDraft(draft: JoyPostDraft) {
    const availableMemberships = new Set(audienceMembers.map((member) => member.membership_id));
    const availableAudienceIds = draft.audience_membership_ids.filter((id) => availableMemberships.has(id));
    setActiveDraftId(draft.id);
    setPostType(draft.post_type);
    setTitle(draft.title ?? "");
    setContent(draft.content);
    setInteractionDeadlineOn(draft.interaction_deadline_on ?? "");
    setVisibilityScope(draft.visibility_scope);
    setAudienceIds(availableAudienceIds);
    setTargetEventIds(draft.event_ids);
    setTargetRotaryYearIds(draft.rotary_year_ids);
    setTargetRoleKeys(draft.role_keys);
    setTargetBirthdayCampaignIds(draft.birthday_campaign_ids);
    setShowFavorites(false);
    setStateMessage(availableAudienceIds.length === draft.audience_membership_ids.length
      ? "已開啟草稿；發布前可再調整閱讀對象與關聯。"
      : "草稿已開啟；部分原指定社員已不是可選社員，請重新確認閱讀對象後再發布。");
    document.getElementById("joy-compose-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function deleteDraft(draftId: string) {
    if (!window.confirm("要刪除這份尚未發布的草稿嗎？")) return;
    setPendingId(`draft:${draftId}`);
    setStateMessage(null);
    try {
      const response = await fetch(endpoint(clubId, `/drafts/${encodeURIComponent(draftId)}`), { method: "DELETE" });
      await readData<{ deleted: true }>(response);
      setDrafts((current) => current.filter((draft) => draft.id !== draftId));
      if (activeDraftId === draftId) setActiveDraftId(null);
      setStateMessage("草稿已刪除。");
    } catch (error) { setStateMessage(requestFailureMessage(error, "草稿沒有刪除，請稍後再試。")); }
    finally { setPendingId(null); }
  }

  async function loadMore() {
    if (!activeCursor || loadingMore) return;
    setLoadingMore(true); setStateMessage(null);
    try {
      const query = new URLSearchParams({ club_id: clubId, cursor: activeCursor, limit: "20", view: showFavorites ? "favorites" : "all" });
      const response = await fetch(`/api/v1/joy/posts?${query.toString()}`, { cache: "no-store" });
      const result = await readData<{ posts: unknown[]; next_cursor: string | null }>(response);
      const nextPosts = result.posts.map(parseJoyPost);
      const appendUnique = (current: JoyPost[]) => {
        const existingIds = new Set(current.map((post) => post.id));
        return [...current, ...nextPosts.filter((post) => !existingIds.has(post.id))];
      };
      if (showFavorites) {
        setFavoritePosts(appendUnique);
        setFavoriteCursor(result.next_cursor);
      } else {
        setPosts(appendUnique);
        setCursor(result.next_cursor);
      }
    } catch (error) { setStateMessage(requestFailureMessage(error, "暫時無法載入更多分享，請稍後再試。")); }
    finally { setLoadingMore(false); }
  }

  async function openFavorites() {
    if (favoritesLoaded) {
      setShowFavorites(true);
      setFilter("all");
      setStateMessage(null);
      return;
    }
    setPendingId("favorites");
    setStateMessage(null);
    try {
      const query = new URLSearchParams({ club_id: clubId, limit: "20", view: "favorites" });
      const response = await fetch(`/api/v1/joy/posts?${query.toString()}`, { cache: "no-store" });
      const result = await readData<{ posts: unknown[]; next_cursor: string | null }>(response);
      setFavoritePosts(result.posts.map(parseJoyPost));
      setFavoriteCursor(result.next_cursor);
      setFavoritesLoaded(true);
      setShowFavorites(true);
      setFilter("all");
    } catch (error) {
      setStateMessage(requestFailureMessage(error, "目前無法載入您的收藏，請稍後再試。"));
    } finally { setPendingId(null); }
  }

  async function toggleFavorite(post: JoyPost) {
    const isFavorite = !post.is_favorited;
    setPendingId(`favorite:${post.id}`);
    setStateMessage(null);
    try {
      const response = await fetch(endpoint(clubId, `/posts/${encodeURIComponent(post.id)}/favorite`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite }),
      });
      const result = await readData<{ is_favorited: boolean }>(response);
      if (result.is_favorited !== isFavorite) throw new JoyRequestError("invalid_favorite_response");
      const updateFavoriteState = (items: JoyPost[]) => items.map((item) =>
        item.id === post.id ? { ...item, is_favorited: result.is_favorited } : item,
      );
      setPosts(updateFavoriteState);
      if (favoritesLoaded) {
        setFavoritePosts((current) => isFavorite
          ? [{ ...post, is_favorited: true }, ...current.filter((item) => item.id !== post.id)]
          : current.filter((item) => item.id !== post.id));
      }
      setStateMessage(isFavorite ? "已加入您的收藏；只有您自己看得到。" : "已從您的收藏移除。");
    } catch (error) {
      setStateMessage(requestFailureMessage(error, "收藏狀態沒有更新，請稍後再試。"));
    } finally { setPendingId(null); }
  }

  async function togglePinned(post: JoyPost) {
    const isPinned = !post.is_pinned;
    setPendingId(`pin:${post.id}`);
    setStateMessage(null);
    try {
      const response = await fetch(endpoint(clubId, `/posts/${encodeURIComponent(post.id)}/pin`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned }),
      });
      const result = await readData<{ is_pinned: boolean; pinned_at: string | null }>(response);
      if (result.is_pinned !== isPinned || (isPinned && !result.pinned_at)) {
        throw new JoyRequestError("invalid_pin_response");
      }
      const updatePinState = (items: JoyPost[]) => items.map((item) =>
        item.id === post.id ? { ...item, is_pinned: result.is_pinned } : item,
      );
      setPosts(updatePinState);
      if (favoritesLoaded) setFavoritePosts(updatePinState);
      setPinnedPosts((current) => isPinned
        ? [{ ...post, is_pinned: true }, ...current.filter((item) => item.id !== post.id)].slice(0, 5)
        : current.filter((item) => item.id !== post.id));
      setStateMessage(isPinned ? "已置頂；全社社員都會優先看到這則分享。" : "已取消置頂。分享仍保留在原本的時間排序中。");
    } catch (error) {
      setStateMessage(requestFailureMessage(error, "置頂狀態沒有更新，請稍後再試。"));
    } finally { setPendingId(null); }
  }

  async function toggleComments(postId: string) {
    const open = !commentsOpen[postId];
    setCommentsOpen((current) => ({ ...current, [postId]: open }));
    if (!open || comments[postId]?.loaded) return;
    setCommentLoadingId(postId);
    try {
      const response = await fetch(endpoint(clubId, `/posts/${encodeURIComponent(postId)}/comments`), { cache: "no-store" });
      const rows = parseJoyComments(await readData<unknown>(response));
      setComments((current) => ({ ...current, [postId]: { items: rows, loaded: true } }));
    } catch (error) { setStateMessage(requestFailureMessage(error, "留言目前無法載入，請稍後再試。")); }
    finally { setCommentLoadingId(null); }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>, post: JoyPost) {
    event.preventDefault();
    const postId = post.id;
    const text = (commentText[postId] ?? "").trim();
    if (!text || Array.from(text).length > JOY_COMMENT_MAX_CODE_POINTS) return;
    setPendingId(`comment:${postId}`); setStateMessage(null);
    try {
      const response = await fetch(endpoint(clubId, `/posts/${encodeURIComponent(postId)}/comments`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentCommentId: replyTo?.postId === postId ? replyTo.commentId : null,
          commentType: commentTypes[postId] ?? defaultCommentType(post),
          content: text,
        }),
      });
      const row = parseJoyComment(await readData<unknown>(response));
      setComments((current) => ({
        ...current,
        [postId]: { items: [...(current[postId]?.items ?? []), row], loaded: true },
      }));
      setPosts((current) => current.map((post) => post.id === postId ? { ...post, comment_count: post.comment_count + 1 } : post));
      setCommentText((current) => ({ ...current, [postId]: "" }));
      setReplyTo(null);
    } catch (error) { setStateMessage(requestFailureMessage(error, "留言沒有送出，請稍後再試。")); }
    finally { setPendingId(null); }
  }

  async function react(post: JoyPost, reactionType: JoyReactionType) {
    setPendingId(`reaction:${post.id}`); setStateMessage(null);
    try {
      const response = await fetch(endpoint(clubId, `/posts/${encodeURIComponent(post.id)}/reaction`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reactionType }),
      });
      const result = await readData<{ reaction_type: JoyReactionType | null }>(response);
      setPosts((current) => current.map((item) => {
        if (item.id !== post.id) return item;
        const counts = { ...item.reaction_counts };
        if (item.my_reaction) counts[item.my_reaction] = Math.max(0, (counts[item.my_reaction] ?? 0) - 1);
        if (result.reaction_type) counts[result.reaction_type] = (counts[result.reaction_type] ?? 0) + 1;
        return { ...item, reaction_counts: counts, my_reaction: result.reaction_type };
      }));
    } catch (error) { setStateMessage(requestFailureMessage(error, "表情沒有送出，請稍後再試。")); }
    finally { setPendingId(null); }
  }

  async function report(postId: string) {
    setPendingId(`report:${postId}`); setStateMessage(null);
    try {
      const response = await fetch(endpoint(clubId, `/posts/${encodeURIComponent(postId)}/report`), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: reportReason }),
      });
      await readData<{ reported: true }>(response);
      setReportedIds((current) => [...current, postId]); setReportingId(null);
      setStateMessage("已送出檢舉，社務管理幹部會依流程處理。");
    } catch (error) { setStateMessage(requestFailureMessage(error, "檢舉沒有送出，請稍後再試。")); }
    finally { setPendingId(null); }
  }

  async function acknowledgeReceipt(postId: string) {
    setPendingId(`receipt:${postId}`); setStateMessage(null);
    try {
      const response = await fetch(endpoint(clubId, `/posts/${encodeURIComponent(postId)}/receipt`), {
        method: "POST",
      });
      const result = await readData<{ acknowledged_at: string }>(response);
      setPosts((current) => current.map((post) => post.id === postId
        ? { ...post, can_acknowledge_receipt: false, receipt_acknowledged_at: result.acknowledged_at }
        : post));
      setFavoritePosts((current) => current.map((post) => post.id === postId
        ? { ...post, can_acknowledge_receipt: false, receipt_acknowledged_at: result.acknowledged_at }
        : post));
      setStateMessage("已確認收到這份分享。");
    } catch (error) { setStateMessage(requestFailureMessage(error, "確認沒有完成，請稍後再試。")); }
    finally { setPendingId(null); }
  }

  async function requestHide(postId: string) {
    setPendingId(`hide:${postId}`); setStateMessage(null);
    try {
      const response = await fetch(endpoint(clubId, `/posts/${encodeURIComponent(postId)}/report`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "recipient_hide_request" }),
      });
      await readData<{ reported: true }>(response);
      const updated = (post: JoyPost) => post.id === postId
        ? { ...post, can_request_hide: false, hide_request_submitted: true }
        : post;
      setPosts((current) => current.map(updated));
      setFavoritePosts((current) => current.map(updated));
      setHideRequestingId(null);
      setStateMessage("已送出隱藏請求，幹部會在管理清單中處理；貼文不會因此立即消失。");
    } catch (error) { setStateMessage(requestFailureMessage(error, "隱藏請求沒有送出，請稍後再試。")); }
    finally { setPendingId(null); }
  }

  async function actOnIou(postId: string, action: JoyIouAction) {
    const note = (iouNotes[postId] ?? "").trim();
    if (action === "cancel" && !note) {
      setStateMessage("取消時請填寫原因，方便雙方了解並保留紀錄。");
      return;
    }
    setPendingId(`iou:${postId}`); setStateMessage(null);
    try {
      const response = await fetch(endpoint(clubId, `/ious/${encodeURIComponent(postId)}`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: note || null }),
      });
      const updated = parseJoyPost(await readData<unknown>(response));
      setPosts((current) => current.map((post) => post.id === postId ? updated : post));
      setIouNotes((current) => ({ ...current, [postId]: "" }));
      setStateMessage(action === "confirm_completion"
        ? "已記錄你的完成確認；雙方都確認後才會結案。"
        : action === "cancel" ? "已取消，原因與狀態變更都已保留紀錄。" : "狀態已更新。");
    } catch (error) { setStateMessage(requestFailureMessage(error, "狀態沒有更新，請重新整理後再試。")); }
    finally { setPendingId(null); }
  }

  async function archive(postId: string) {
    if (!window.confirm("要把這則分享收起來嗎？它會從歡喜牆移除，但紀錄不會被硬刪除。")) return;
    setPendingId(`archive:${postId}`); setStateMessage(null);
    try {
      const response = await fetch(endpoint(clubId, `/posts/${encodeURIComponent(postId)}`), { method: "DELETE" });
      await readData<{ archived: true }>(response);
      setPosts((current) => current.filter((post) => post.id !== postId));
    } catch (error) { setStateMessage(requestFailureMessage(error, "這則分享目前無法收起，請稍後再試。")); }
    finally { setPendingId(null); }
  }

  function beginEdit(post: JoyPost) {
    setEditingId(post.id); setEditingDraft({
      postType: post.post_type, title: post.title ?? "", content: post.content,
      interactionDeadlineOn: post.interaction_deadline_on,
    });
    setStateMessage(null);
  }

  async function saveEdit(postId: string) {
    if (!editingDraft) return;
    setPendingId(`edit:${postId}`); setStateMessage(null);
    try {
      const response = await fetch(endpoint(clubId, `/posts/${encodeURIComponent(postId)}`), {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editingDraft),
      });
      const updated = parseJoyPost(await readData<unknown>(response));
      setPosts((current) => current.map((post) => post.id === postId ? { ...updated, reaction_counts: post.reaction_counts, comment_count: post.comment_count } : post));
      setEditingId(null); setEditingDraft(null);
    } catch (error) { setStateMessage(requestFailureMessage(error, "編輯沒有儲存，請稍後再試。")); }
    finally { setPendingId(null); }
  }

  return <div className={styles.layout}>
    <section className={styles.composer} aria-labelledby="joy-compose-title">
      <div className={styles.sectionIntro}>
        <span className={styles.sparkle} aria-hidden="true">✦</span>
        <div><p className="eyebrow">把好事留在社內</p><h2 id="joy-compose-title">分享一份歡喜</h2></div>
      </div>
      <form onSubmit={(event) => void publish(event)}>
        <div className={styles.formRow}>
          <label className={styles.field}><span>分享類別</span>
            <select value={postType} onChange={(event) => {
              const nextType = event.target.value as JoyPostType;
              setPostType(nextType);
              if (nextType === "iou") setActiveDraftId(null);
            }} disabled={publishing}>
              {joyPostTypes.map((type) => <option key={type} value={type}>{postTypeLabels[type]}</option>)}
            </select>
          </label>
          <label className={styles.field}><span>一句標題（選填）</span>
            <input value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)} placeholder="例如：謝謝大家今天的幫忙" disabled={publishing} />
          </label>
        </div>
        <label className={styles.field}><span>{postType === "iou" ? "承諾內容" : "分享內容"}</span>
          <textarea value={content} rows={4} maxLength={JOY_POST_MAX_CODE_POINTS} onChange={(event) => setContent(event.target.value)}
            placeholder={postType === "iou" ? "例如：我會協助你整理活動照片，或幫忙搬運物資……" : "寫下想跟社友分享的祝福、感謝或回憶……"} disabled={publishing} />
        </label>
        <div className={styles.counter} aria-live="polite">{contentLength} / {JOY_POST_MAX_CODE_POINTS}</div>

        {postType !== "iou" && <label className={styles.field}>
          <span>留言／回答截止日（選填）</span>
          <input type="date" value={interactionDeadlineOn} onChange={(event) => setInteractionDeadlineOn(event.target.value)} disabled={publishing} />
          <small className={styles.deadlineHelp}>依台灣日期計算；截止日當天結束後停止新留言與回答，既有內容仍可閱讀。</small>
        </label>}

        {postType === "iou" ? <fieldset className={styles.audiencePicker}>
          <legend>這份承諾是給哪一位社員？</legend>
          <p className={styles.iouPrivacyNote}>這是非現金的幫忙或承諾，不填捐款金額；內容只有你和指定社員看得到。</p>
          <label className={styles.field}><span>指定社員</span>
            <select value={iouRecipientId} onChange={(event) => setIouRecipientId(event.target.value)} disabled={publishing} required>
              <option value="">請選擇一位社員</option>
              {audienceMembers.map((member) => <option key={member.membership_id} value={member.membership_id}>{member.display_name}</option>)}
            </select>
          </label>
          <label className={styles.field}><span>希望完成日期（選填）</span>
            <input type="date" min={todayInTaiwan()} value={iouDueOn} onChange={(event) => setIouDueOn(event.target.value)} disabled={publishing} />
          </label>
        </fieldset> : <>
          <fieldset className={styles.visibility}>
            <legend>{postType === "question" ? "誰可以看到並回答？" : "誰可以看到？"}</legend>
            {(Object.keys(scopeLabels) as JoyVisibilityScope[]).map((scope) => <label key={scope} className={styles.radioOption}>
              <input type="radio" name="joy-visibility" checked={visibilityScope === scope}
                onChange={() => { setVisibilityScope(scope); if (scope === "club") setAudienceIds([]); }} disabled={publishing} />
              <span><strong>{scopeLabels[scope]}</strong>
                <small>{postType === "question"
                  ? scope === "club" ? "全社可閱讀；不會逐位建立待辦" : scope === "selected" ? "指定社員可閱讀，並會收到回答待辦" : "只有您和一位社員可看；對方會收到回答待辦"
                  : scope === "club" ? "分享給本社所有有效社員" : scope === "selected" ? "只有您挑選的社員看得到" : "內容只在您和一位社員之間顯示"}</small>
              </span>
            </label>)}
          </fieldset>

          {visibilityScope !== "club" && <fieldset className={styles.audiencePicker}>
            <legend>{visibilityScope === "private" ? "選一位收件社員" : "選擇可以閱讀的社員"}</legend>
            {audienceMembers.length === 0
              ? <p className={styles.muted}>目前無法載入可選社員名單，請稍後再試。</p>
              : <div className={styles.memberOptions}>{audienceMembers.map((member) => {
                const checked = audienceIds.includes(member.membership_id);
                const disabled = publishing || (visibilityScope === "private" && audienceIds.length === 1 && !checked)
                  || (visibilityScope === "selected" && audienceIds.length >= 25 && !checked);
                return <label key={member.membership_id} className={styles.memberOption}>
                  <input type={visibilityScope === "private" ? "radio" : "checkbox"}
                    name={visibilityScope === "private" ? "joy-private-recipient" : undefined}
                    checked={checked} disabled={disabled}
                    onChange={() => setAudienceIds((current) => checked
                      ? current.filter((id) => id !== member.membership_id)
                      : visibilityScope === "private" ? [member.membership_id] : [...current, member.membership_id])} />
                  <Avatar name={member.display_name} avatarUrl={member.avatar_url} />
                  <span>{member.display_name}</span>
                </label>;
              })}</div>}
            {visibilityScope === "selected" && <small>最多選 25 位。已選 {audienceCount} 位。</small>}
          </fieldset>}
          <fieldset className={styles.targetPicker}>
            <legend>關聯活動、職務、生日祝福或扶輪年度（選填）</legend>
            <p className={styles.targetHelp}>關聯只補充分享背景，不會改變閱讀範圍。職務只顯示職稱、不顯示任職社員；生日只列已公開的祝福，且不顯示生日日期。</p>
            {targetOptionsUnavailable && <p className={styles.muted}>目前無法載入關聯選項；仍可先分享不含關聯的內容。</p>}
            {targetOptions.events.length > 0 && <div className={styles.targetOptions} aria-label="可關聯活動">
              {targetOptions.events.map((eventOption) => {
                const checked = targetEventIds.includes(eventOption.id);
                return <label key={eventOption.id} className={styles.targetOption}>
                  <input type="checkbox" checked={checked}
                    disabled={publishing || (targetEventIds.length >= 5 && !checked)}
                    onChange={() => setTargetEventIds((current) => checked
                      ? current.filter((id) => id !== eventOption.id) : [...current, eventOption.id])} />
                  <span><strong>{eventOption.title}</strong><small>{formatTime(eventOption.starts_at)}</small></span>
                </label>;
              })}
            </div>}
            {targetOptions.rotary_years.length > 0 && <div className={styles.targetOptions} aria-label="可關聯扶輪年度">
              {targetOptions.rotary_years.map((year) => {
                const checked = targetRotaryYearIds.includes(year.id);
                const label = `${year.start_year}-${String(year.start_year + 1).slice(-2)} 扶輪年度`;
                return <label key={year.id} className={styles.targetOption}>
                  <input type="checkbox" checked={checked}
                    disabled={publishing || (targetRotaryYearIds.length >= 5 && !checked)}
                    onChange={() => setTargetRotaryYearIds((current) => checked
                      ? current.filter((id) => id !== year.id) : [...current, year.id])} />
                  <span><strong>{label}</strong>{year.theme && <small>{year.theme}</small>}</span>
                </label>;
              })}
            </div>}
            {targetOptions.roles.length > 0 && <div className={styles.targetOptions} aria-label="可關聯職務">
              {targetOptions.roles.map((role) => {
                const checked = targetRoleKeys.includes(role.role_key);
                return <label key={role.role_key} className={styles.targetOption}>
                  <input type="checkbox" checked={checked}
                    disabled={publishing || (targetRoleKeys.length >= 5 && !checked)}
                    onChange={() => setTargetRoleKeys((current) => checked
                      ? current.filter((key) => key !== role.role_key) : [...current, role.role_key])} />
                  <span><strong>{role.label}</strong><small>只關聯職務，不記錄由誰擔任</small></span>
                </label>;
              })}
            </div>}
            {targetOptions.birthday_campaigns.length > 0 && <div className={styles.targetOptions} aria-label="可關聯已公開生日祝福">
              {targetOptions.birthday_campaigns.map((campaign) => {
                const checked = targetBirthdayCampaignIds.includes(campaign.id);
                return <label key={campaign.id} className={styles.targetOption}>
                  <input type="checkbox" checked={checked}
                    disabled={publishing || (targetBirthdayCampaignIds.length >= 5 && !checked)}
                    onChange={() => setTargetBirthdayCampaignIds((current) => checked
                      ? current.filter((id) => id !== campaign.id) : [...current, campaign.id])} />
                  <span><strong>{campaign.recipient_name}的生日祝福</strong><small>{campaign.birthday_year} 年度</small></span>
                </label>;
              })}
            </div>}
            {!targetOptionsUnavailable && targetOptions.events.length === 0 && targetOptions.rotary_years.length === 0
              && targetOptions.roles.length === 0 && targetOptions.birthday_campaigns.length === 0
              && <p className={styles.muted}>目前沒有可關聯的活動、職務、已公開生日祝福或扶輪年度。</p>}
          </fieldset>
        </>}

        {stateMessage && <p className={styles.stateMessage} role="status">{stateMessage}</p>}
        <div className={styles.composerFooter}>
          <span className={styles.privacyNote}>{postType === "iou" ? "🔒 僅雙方可見；狀態變更會保留紀錄" : "🔒 只在本社內依閱讀範圍顯示"}</span>
          {postType !== "iou" && <button type="button" className={styles.secondaryButton}
            disabled={publishing || contentLength > JOY_POST_MAX_CODE_POINTS} onClick={() => void saveDraft()}>
            {publishing ? "儲存中…" : activeDraftId ? "更新草稿" : "存草稿"}
          </button>}
          <button type="submit" disabled={publishing || contentLength < 1 || contentLength > JOY_POST_MAX_CODE_POINTS || !audienceValid}>
            {publishing ? "送出中…" : postType === "iou" ? "提出承諾" : "分享"}
          </button>
        </div>
      </form>
      <section className={styles.drafts} aria-labelledby="joy-drafts-title">
        <div className={styles.draftsHeader}><h3 id="joy-drafts-title">我的草稿</h3><span>{drafts.length} / 20</span></div>
        {draftsUnavailable
          ? <p className={styles.muted}>目前無法載入草稿；請稍後重新整理，草稿不會因此公開。</p>
          : drafts.length === 0
            ? <p className={styles.muted}>還沒有草稿。未發布的內容只有你看得到。</p>
            : <ul className={styles.draftList}>{drafts.map((draft) => <li key={draft.id} className={styles.draftItem}>
              <div><strong>{draft.title || postTypeLabels[draft.post_type]}</strong>
                <span>{draft.content.trim() ? `${draft.content.slice(0, 90)}${draft.content.length > 90 ? "…" : ""}` : "尚未填寫內容"}</span>
                {draft.interaction_deadline_on && <small>留言／回答截止日：{formatDueDate(draft.interaction_deadline_on)}</small>}
                <small>上次儲存：{formatTime(draft.updated_at)}</small>
              </div>
              <div className={styles.draftActions}>
                <button type="button" onClick={() => resumeDraft(draft)}>繼續編輯</button>
                <button type="button" className={styles.draftDelete} disabled={pendingId === `draft:${draft.id}`}
                  onClick={() => void deleteDraft(draft.id)}>{pendingId === `draft:${draft.id}` ? "刪除中…" : "刪除"}</button>
              </div>
            </li>)}</ul>}
      </section>
    </section>

    <section className={styles.feed} aria-labelledby="joy-feed-title">
      <div className={styles.feedHeader}>
        <div><p className="eyebrow">社內好事簿</p><h2 id="joy-feed-title">看看大家分享什麼</h2></div>
        <span aria-live="polite" className={styles.postCount}>
          {filter === "all"
            ? `${showFavorites ? "我的收藏" : "社內動態"} · ${activeCursor ? `目前顯示 ${feedPosts.length} 則` : `${feedPosts.length} 則`}`
            : `${visiblePosts.length} 則此類別${activeCursor ? ` · 已載入 ${activePosts.length} 則` : ""}`}
        </span>
      </div>
      <div className={styles.filters} role="group" aria-label="切換分享範圍">
        <button type="button" aria-pressed={!showFavorites} className={!showFavorites ? styles.filterActive : styles.filter}
          onClick={() => { setShowFavorites(false); setFilter("all"); setStateMessage(null); }}>社內動態</button>
        <button type="button" aria-pressed={showFavorites} className={showFavorites ? styles.filterActive : styles.filter}
          disabled={pendingId === "favorites"} onClick={() => void openFavorites()}>
          {pendingId === "favorites" ? "載入收藏中…" : "我的收藏"}
        </button>
        {showFavorites && <span className={styles.favoritePrivacy}>收藏只對自己可見</span>}
      </div>
      {!showFavorites && filter === "all" && pinnedPosts.length > 0
        && <p className={styles.pinnedHelp}>社務管理幹部置頂的分享會優先顯示；其他分享仍依時間排列。</p>}
      {!showFavorites && pinnedPostsUnavailable
        && <p className={styles.pinnedWarning} role="status">置頂分享暫時無法載入；下方一般動態仍可正常瀏覽。</p>}
      <div className={styles.filters} role="group" aria-label="依分享類別篩選">
        <button type="button" aria-pressed={filter === "all"} className={filter === "all" ? styles.filterActive : styles.filter} onClick={() => setFilter("all")}>全部</button>
        {joyPostTypes.map((type) => <button key={type} type="button" className={filter === type ? styles.filterActive : styles.filter}
          aria-pressed={filter === type} onClick={() => setFilter(type)}>{postTypeLabels[type]}</button>)}
      </div>
      {feedPosts.length === 0
        ? <div className={styles.empty}><span aria-hidden="true">✦</span>
          <strong>{showFavorites ? "您還沒有收藏的分享" : filter === "all" ? "這裡還沒有分享" : "這個類別還沒有分享"}</strong>
          <p>{showFavorites ? "看到想留著的祝福或回憶，按下「收藏」後就能在這裡快速找回。" : filter === "all" ? "留下第一份祝福、感謝或回憶，讓社內的好事被看見。" : "試試其他類別，或回到全部分享。"}</p>
          {showFavorites
            ? <button type="button" onClick={() => { setShowFavorites(false); setFilter("all"); }}>回到社內動態</button>
            : filter !== "all" && <button type="button" onClick={() => setFilter("all")}>顯示全部分享</button>}
        </div>
        : <div className={styles.postList}>{feedPosts.map((post) => {
          const postComments = comments[post.id]?.items ?? [];
          const topLevelComments = postComments.filter((comment) => !comment.parent_comment_id);
          const replies = postComments.filter((comment) => comment.parent_comment_id);
          const draft = editingId === post.id ? editingDraft : null;
          const isAddressedRecipient = post.can_acknowledge_receipt
            || post.receipt_acknowledged_at !== null
            || post.can_request_hide
            || post.hide_request_submitted;
          return <article id={`joy-post-${post.id}`} key={post.id}
            className={`${styles.post} ${post.is_hidden ? styles.hiddenPost : ""} ${focusedPostId === post.id ? styles.focusedPost : ""}`}>
            <header className={styles.postHeader}>
              <Avatar name={post.author_display_name} avatarUrl={post.author_avatar_url} />
              <div className={styles.author}><strong>{post.author_display_name}</strong><span>{formatTime(post.created_at)}{post.updated_at !== post.created_at ? " · 已編輯" : ""}</span></div>
              {post.is_pinned && <span className={styles.pinnedBadge}>置頂</span>}
              <span className={styles.postType}>{postTypeLabels[post.post_type]}</span>
            </header>
            {post.is_hidden && <p className={styles.hiddenNotice}>這則分享已暫時隱藏，只有您和管理幹部可見。</p>}
            <div className={styles.scopeLine}>{scopeLabels[post.visibility_scope]}</div>
            {post.interaction_deadline_on && <p className={styles.interactionDeadline}>
              留言／回答截止日：{formatDueDate(post.interaction_deadline_on)}
              {!post.interactions_open && <strong> · 已截止，歷史內容仍可閱讀</strong>}
            </p>}
            {post.targets.length > 0 && <ul className={styles.targetChips} aria-label="關聯對象">
              {post.targets.map((target) => <li key={`${target.target_type}:${target.target_id}`}>
                <strong>{{ event: "活動", rotary_year: "扶輪年度", role: "職務", birthday_campaign: "生日祝福" }[target.target_type]}</strong>
                <span>{target.label}</span>
                {target.detail && <small>{target.detail}</small>}
              </li>)}
            </ul>}
            {draft ? <div className={styles.editForm}>
              <label className={styles.field}><span>分享類別</span><select value={draft.postType} onChange={(event) => setEditingDraft({ ...draft, postType: event.target.value as JoyPostType })}>
                {joyCreatablePostTypes.map((type) => <option key={type} value={type}>{postTypeLabels[type]}</option>)}
              </select></label>
              <label className={styles.field}><span>標題</span><input value={draft.title} maxLength={100} onChange={(event) => setEditingDraft({ ...draft, title: event.target.value })} /></label>
              <label className={styles.field}><span>內容</span><textarea value={draft.content} rows={4} maxLength={JOY_POST_MAX_CODE_POINTS} onChange={(event) => setEditingDraft({ ...draft, content: event.target.value })} /></label>
              <label className={styles.field}><span>留言／回答截止日（選填）</span>
                <input type="date" value={draft.interactionDeadlineOn ?? ""}
                  onChange={(event) => setEditingDraft({ ...draft, interactionDeadlineOn: event.target.value || null })} />
                <small className={styles.deadlineHelp}>截止日當天結束後停止新留言與回答；既有內容仍可閱讀。</small>
              </label>
              <div className={styles.actionRow}>
                <button type="button" className={styles.secondaryButton} onClick={() => { setEditingId(null); setEditingDraft(null); }}>取消</button>
                <button type="button" disabled={pendingId === `edit:${post.id}`} onClick={() => void saveEdit(post.id)}>{pendingId === `edit:${post.id}` ? "儲存中…" : "儲存修改"}</button>
              </div>
            </div> : <div className={styles.postBody}>
              {post.title && <h3>{post.title}</h3>}
              <p>{post.content}</p>
            </div>}
            {post.iou && <section className={styles.iouCard} aria-label="非現金承諾狀態">
              <div className={styles.iouStatusRow}>
                <strong className={post.iou.is_overdue ? styles.iouOverdue : styles.iouStatus}>
                  {iouStatusLabel(post.iou)}
                </strong>
                <span>{post.iou.viewer_role === "promisor" ? `承諾給 ${post.iou.recipient_display_name}` : "這份承諾是給你的"}</span>
              </div>
              {post.iou.due_on && <p className={styles.iouDetail}>希望完成日期：{formatDueDate(post.iou.due_on)}</p>}
              {post.iou.recipient_response_note && <p className={styles.iouDetail}>
                {post.iou.viewer_role === "promisor" ? "對方回覆" : "你的回覆"}：{post.iou.recipient_response_note}
              </p>}
              {(post.iou.promisor_completion_confirmed || post.iou.recipient_completion_confirmed)
                && <div className={styles.iouConfirmations}>
                  <span>{post.iou.promisor_completion_confirmed ? "✓" : "○"} 提出者確認完成</span>
                  <span>{post.iou.recipient_completion_confirmed ? "✓" : "○"} 收件者確認完成</span>
                </div>}
              {post.iou.promisor_completion_note && <p className={styles.iouDetail}>提出者說明：{post.iou.promisor_completion_note}</p>}
              {post.iou.recipient_completion_note && <p className={styles.iouDetail}>收件者說明：{post.iou.recipient_completion_note}</p>}
              {post.iou.cancellation_note && <p className={styles.iouDetail}>取消原因：{post.iou.cancellation_note}</p>}
              {(post.iou.can_accept || post.iou.can_decline || post.iou.can_confirm_completion || post.iou.can_cancel)
                && <label className={styles.field}><span>給對方的回覆／完成說明（取消時必填）</span>
                  <textarea rows={2} maxLength={500} value={iouNotes[post.id] ?? ""}
                    onChange={(event) => setIouNotes((current) => ({ ...current, [post.id]: event.target.value }))}
                    disabled={pendingId === `iou:${post.id}`} />
                </label>}
              <div className={styles.iouActions}>
                {post.iou.can_accept && <button type="button" disabled={pendingId === `iou:${post.id}`} onClick={() => void actOnIou(post.id, "accept")}>答應</button>}
                {post.iou.can_decline && <button type="button" className={styles.secondaryButton} disabled={pendingId === `iou:${post.id}`} onClick={() => void actOnIou(post.id, "decline")}>婉拒</button>}
                {post.iou.can_start && <button type="button" disabled={pendingId === `iou:${post.id}`} onClick={() => void actOnIou(post.id, "start")}>開始履行</button>}
                {post.iou.can_confirm_completion && <button type="button" disabled={pendingId === `iou:${post.id}`} onClick={() => void actOnIou(post.id, "confirm_completion")}>確認已完成</button>}
                {post.iou.can_cancel && <button type="button" className={styles.secondaryButton} disabled={pendingId === `iou:${post.id}`} onClick={() => void actOnIou(post.id, "cancel")}>取消承諾</button>}
              </div>
            </section>}
            <div className={styles.actions}>
              {!post.is_hidden && !post.iou && <div className={styles.reactions}>
                {joyReactionTypes.filter((reaction) => !(isAddressedRecipient && reaction === "thanks")).map((reaction) => <button type="button" key={reaction}
                  className={post.my_reaction === reaction ? styles.reactionSelected : styles.reaction}
                  aria-pressed={post.my_reaction === reaction} disabled={pendingId === `reaction:${post.id}`}
                  onClick={() => void react(post, reaction)}>
                  <span>{reactionLabels[reaction]}</span>{(post.reaction_counts[reaction] ?? 0) > 0 && <small>{post.reaction_counts[reaction]}</small>}
                </button>)}
              </div>}
              <div className={styles.actionLinks}>
                {isAddressedRecipient && !post.is_hidden && <button type="button"
                  aria-pressed={post.my_reaction === "thanks"}
                  className={post.my_reaction === "thanks" ? styles.favoriteSelected : undefined}
                  disabled={pendingId === `reaction:${post.id}`}
                  onClick={() => void react(post, "thanks")}>
                  {pendingId === `reaction:${post.id}` ? "送出中…" : post.my_reaction === "thanks" ? "已感謝作者（再點取消）" : "🙏 感謝作者"}
                </button>}
                {post.receipt_ack_count !== null && post.recipient_count !== null
                  && post.recipient_count > 0
                  && <span className={styles.recipientActionStatus}>已確認收到 {post.receipt_ack_count}/{post.recipient_count} 位</span>}
                {post.receipt_acknowledged_at && <span className={styles.recipientActionStatus}>你已確認收到</span>}
                {post.can_acknowledge_receipt && <button type="button"
                  disabled={pendingId === `receipt:${post.id}`}
                  onClick={() => void acknowledgeReceipt(post.id)}>
                  {pendingId === `receipt:${post.id}` ? "確認中…" : "確認已收到"}
                </button>}
                {post.hide_request_submitted && <span className={styles.recipientActionStatus}>隱藏請求已送出，等待幹部處理</span>}
                {post.can_request_hide && <button type="button"
                  onClick={() => { setHideRequestingId(hideRequestingId === post.id ? null : post.id); setStateMessage(null); }}>
                  {hideRequestingId === post.id ? "取消隱藏請求" : "要求幹部隱藏"}
                </button>}
                {!post.is_hidden && <button type="button" aria-pressed={post.is_favorited}
                  aria-label={post.is_favorited ? "從我的收藏移除" : "加入我的收藏"}
                  className={post.is_favorited ? styles.favoriteSelected : undefined}
                  disabled={pendingId === `favorite:${post.id}`} onClick={() => void toggleFavorite(post)}>
                  {pendingId === `favorite:${post.id}` ? "更新中…" : post.is_favorited ? "已收藏" : "收藏"}
                </button>}
                {canManagePublicPosts && post.visibility_scope === "club" && post.post_type !== "iou" && !post.is_hidden
                  && <button type="button" aria-pressed={post.is_pinned}
                    aria-label={post.is_pinned ? "取消置頂分享" : "置頂分享"}
                    disabled={pendingId === `pin:${post.id}`} onClick={() => void togglePinned(post)}>
                    {pendingId === `pin:${post.id}` ? "更新中…" : post.is_pinned ? "取消置頂" : "置頂"}
                  </button>}
                {!post.is_hidden && !post.iou && <button type="button" onClick={() => void toggleComments(post.id)}>
                  {commentsOpen[post.id] ? "收起留言" : `留言與回應（${post.comment_count}）`}
                </button>}
                {post.can_edit && !draft && !post.is_hidden && <button type="button" onClick={() => beginEdit(post)}>編輯</button>}
                {post.can_archive && !post.is_hidden && <button type="button" onClick={() => void archive(post.id)} disabled={pendingId === `archive:${post.id}`}>收起分享</button>}
                {!post.can_edit && !post.is_hidden && !post.hide_request_submitted && !reportedIds.includes(post.id)
                  && <button type="button" onClick={() => { setReportingId(reportingId === post.id ? null : post.id); setStateMessage(null); }}>檢舉</button>}
                {reportedIds.includes(post.id) && <span className={styles.reported}>已檢舉</span>}
              </div>
            </div>
            {reportingId === post.id && <div className={styles.reportForm}>
              <label className={styles.field}><span>檢舉原因</span><select value={reportReason} onChange={(event) => setReportReason(event.target.value as JoyReportReason)}>
                {joyReportReasons.filter((reason) => reason !== "recipient_hide_request")
                  .map((reason) => <option key={reason} value={reason}>{reportLabels[reason]}</option>)}
              </select></label>
              <button type="button" disabled={pendingId === `report:${post.id}`} onClick={() => void report(post.id)}>{pendingId === `report:${post.id}` ? "送出中…" : "送出檢舉"}</button>
            </div>}
            {hideRequestingId === post.id && post.can_request_hide && <div className={styles.reportForm} role="region" aria-label="要求幹部隱藏分享">
              <p className={styles.hideRequestNote}>送出後會列入社務管理的檢舉清單，由幹部審核；分享不會立即消失。</p>
              <button type="button" disabled={pendingId === `hide:${post.id}`} onClick={() => void requestHide(post.id)}>
                {pendingId === `hide:${post.id}` ? "送出中…" : "送出隱藏請求"}
              </button>
            </div>}
            {commentsOpen[post.id] && !post.iou && <section className={styles.comments} aria-label="留言與回應">
              <h4>留言與回應</h4>
              {commentLoadingId === post.id || (focusedQuestionId === post.id && !comments[post.id]?.loaded && focusedCommentsErrorId !== post.id)
                ? <p className={styles.muted}>正在載入留言……</p>
                : postComments.length === 0 ? <p className={styles.muted}>還沒有留言，來說第一句鼓勵的話吧。</p>
                  : <div className={styles.commentList}>{topLevelComments.map((comment) => <div key={comment.id}>
                    <CommentItem comment={comment} />
                    {!post.is_hidden && post.interactions_open && <button className={styles.replyButton} type="button" onClick={() => setReplyTo({ postId: post.id, commentId: comment.id })}>回覆</button>}
                    {replies.filter((reply) => reply.parent_comment_id === comment.id).map((reply) => <CommentItem key={reply.id} comment={reply} reply />)}
                  </div>)}</div>}
              {!post.is_hidden && post.interactions_open && <form className={styles.commentForm} onSubmit={(event) => void submitComment(event, post)}>
                {replyTo?.postId === post.id && <p className={styles.replying}>正在回覆留言 <button type="button" onClick={() => setReplyTo(null)}>取消回覆</button></p>}
                <label className={styles.field}><span>留言性質</span><select value={commentTypes[post.id] ?? defaultCommentType(post)}
                  onChange={(event) => setCommentTypes((current) => ({ ...current, [post.id]: event.target.value as JoyCommentType }))}>
                  {joyCommentTypes.filter((type) => type !== "answer" || post.can_answer)
                    .map((type) => <option key={type} value={type}>{commentTypeLabels[type]}</option>)}
                </select></label>
                <label className={styles.field}><span>寫下回應</span><textarea rows={2} maxLength={JOY_COMMENT_MAX_CODE_POINTS}
                  value={commentText[post.id] ?? ""} onChange={(event) => setCommentText((current) => ({ ...current, [post.id]: event.target.value }))}
                  placeholder="祝福、鼓勵或友善提問……" /></label>
                <button type="submit" disabled={pendingId === `comment:${post.id}` || !(commentText[post.id] ?? "").trim()}>
                  {pendingId === `comment:${post.id}` ? "送出中…" : post.post_type === "question" && (commentTypes[post.id] ?? defaultCommentType(post)) === "answer" ? "送出回答" : "送出留言"}
                </button>
              </form>}
              {!post.interactions_open && <p className={styles.interactionClosedNote} role="note">
                這則分享已截止留言／回答；您仍可閱讀過去的內容。
              </p>}
            </section>}
          </article>;
        })}</div>}
      {activeCursor && <button type="button" className={styles.loadMore} onClick={() => void loadMore()} disabled={loadingMore}>
        {loadingMore ? "載入中…" : "查看更多分享"}
      </button>}
      <p className={styles.footerNote}>歡喜牆僅供社內交流。若內容讓您不舒服，可以檢舉請幹部協助。</p>
    </section>
  </div>;
}

function CommentItem({ comment, reply = false }: { comment: JoyComment; reply?: boolean }) {
  return <article className={`${styles.comment} ${reply ? styles.reply : ""}`}>
    <Avatar name={comment.author_display_name} avatarUrl={comment.author_avatar_url} />
    <div><div className={styles.commentMeta}><strong>{comment.author_display_name}</strong><span>{commentTypeLabels[comment.comment_type]} · {formatTime(comment.created_at)}</span></div>
      <p>{comment.content}</p></div>
  </article>;
}

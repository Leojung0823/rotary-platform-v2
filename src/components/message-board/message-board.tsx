"use client";

/* eslint-disable @next/next/no-img-element, react-hooks/set-state-in-effect */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { BoardPost } from "@/lib/message-board/contracts";
import styles from "./message-board.module.css";

const BOARD_CONTENT_MAX_CODE_POINTS = 1000;
function boardContentLength(value: string) { return Array.from(value).length; }

type BoardList = { posts: BoardPost[]; next_cursor: string | null };
type ApiEnvelope<T> = { data?: T; error?: string };

class BoardRequestError extends Error {
  constructor(readonly status: number) {
    super("board_request_failed");
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || !payload?.data) throw new BoardRequestError(response.status);
  return payload.data;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "時間未知";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function safeAvatarUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function Avatar({ post }: { post: BoardPost }) {
  const [failed, setFailed] = useState(false);
  const url = safeAvatarUrl(post.author_avatar_url);
  const initial = post.author_display_name.trim().slice(0, 1) || "？";
  return <span className={styles.avatar} aria-hidden="true">
    <span>{initial}</span>
    {url && !failed && <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
  </span>;
}

function validationMessage(value: string) {
  const length = boardContentLength(value.replace(/\r\n?/g, "\n").trim());
  if (length === 0) return "請輸入留言內容。";
  if (length > BOARD_CONTENT_MAX_CODE_POINTS) return `留言最多 ${BOARD_CONTENT_MAX_CODE_POINTS} 個字。`;
  return null;
}

function boardEndpoint(clubId: string, postId?: string, parameters?: URLSearchParams) {
  const query = parameters ?? new URLSearchParams();
  query.set("club_id", clubId);
  const path = postId ? `/api/v1/board/posts/${postId}` : "/api/v1/board/posts";
  return `${path}?${query.toString()}`;
}

export function MessageBoard({ clubId }: { clubId: string }) {
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [pendingPostId, setPendingPostId] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [stateMessage, setStateMessage] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const handleError = useCallback((error: unknown) => {
    if (error instanceof BoardRequestError && (error.status === 401 || error.status === 403)) {
      setSessionExpired(true);
      setStateMessage("登入狀態已失效，或您不是這個扶輪社的有效社員。請重新登入或切換社別。");
      return;
    }
    setStateMessage("操作未完成，請稍後再試。");
  }, []);

  const loadPosts = useCallback(async (nextCursor: string | null, append: boolean) => {
    append ? setLoadingMore(true) : setLoading(true);
    setStateMessage(null);
    try {
      const query = new URLSearchParams({ limit: "20" });
      if (nextCursor) query.set("cursor", nextCursor);
      const response = await fetch(boardEndpoint(clubId, undefined, query), { cache: "no-store" });
      const data = await readResponse<BoardList>(response);
      setPosts(current => append ? [...current, ...data.posts] : data.posts);
      setCursor(data.next_cursor);
    } catch (error) {
      handleError(error);
    } finally {
      append ? setLoadingMore(false) : setLoading(false);
    }
  }, [clubId, handleError]);

  useEffect(() => {
    let cancelled = false;
    setPosts([]);
    setCursor(null);
    setLoading(true);
    setSessionExpired(false);

    async function loadInitialPosts() {
      try {
        const query = new URLSearchParams({ limit: "20" });
        const response = await fetch(boardEndpoint(clubId, undefined, query), { cache: "no-store" });
        const data = await readResponse<BoardList>(response);
        if (!cancelled) {
          setPosts(data.posts);
          setCursor(data.next_cursor);
        }
      } catch (error) {
        if (!cancelled) handleError(error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitialPosts();
    return () => { cancelled = true; };
  }, [clubId, handleError]);

  async function publish(event: FormEvent) {
    event.preventDefault();
    const invalid = validationMessage(content);
    if (invalid) { setStateMessage(invalid); return; }
    setPublishing(true);
    setStateMessage(null);
    try {
      const response = await fetch(boardEndpoint(clubId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const post = await readResponse<BoardPost>(response);
      setPosts(current => [post, ...current]);
      setContent("");
    } catch (error) {
      handleError(error);
    } finally {
      setPublishing(false);
    }
  }

  function beginEdit(post: BoardPost) {
    setEditingPostId(post.id);
    setEditingContent(post.content);
    setStateMessage(null);
  }

  async function saveEdit(postId: string) {
    const invalid = validationMessage(editingContent);
    if (invalid) { setStateMessage(invalid); return; }
    setPendingPostId(postId);
    setStateMessage(null);
    try {
      const response = await fetch(boardEndpoint(clubId, postId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editingContent }),
      });
      const updated = await readResponse<BoardPost>(response);
      setPosts(current => current.map(post => post.id === postId ? updated : post));
      setEditingPostId(null);
      setEditingContent("");
    } catch (error) {
      handleError(error);
    } finally {
      setPendingPostId(null);
    }
  }

  async function remove(postId: string) {
    if (!window.confirm("確定要刪除這則留言嗎？刪除後無法從留言板恢復。")) return;
    setPendingPostId(postId);
    setStateMessage(null);
    try {
      const response = await fetch(boardEndpoint(clubId, postId), { method: "DELETE" });
      await readResponse<{ deleted: true }>(response);
      setPosts(current => current.filter(post => post.id !== postId));
      if (editingPostId === postId) setEditingPostId(null);
    } catch (error) {
      handleError(error);
    } finally {
      setPendingPostId(null);
    }
  }

  const contentCount = boardContentLength(content);

  return <div className={styles.board}>
    <section className={styles.composer} aria-labelledby="new-post-title">
      <div>
        <p className={styles.eyebrow}>分享近況</p>
        <h2 id="new-post-title">新增留言</h2>
      </div>
      <form onSubmit={publish}>
        <label className={styles.srOnly} htmlFor="board-content">留言內容</label>
        <textarea
          id="board-content"
          value={content}
          onChange={event => setContent(event.target.value)}
          rows={4}
          placeholder="輸入想和本社社員分享的內容……"
          disabled={publishing || sessionExpired}
          aria-invalid={contentCount > BOARD_CONTENT_MAX_CODE_POINTS}
        />
        <div className={styles.composerFooter}>
          <span className={contentCount > BOARD_CONTENT_MAX_CODE_POINTS ? styles.overLimit : undefined}>
            {contentCount} / {BOARD_CONTENT_MAX_CODE_POINTS}
          </span>
          <button type="submit" disabled={publishing || sessionExpired}>{publishing ? "發布中…" : "發布留言"}</button>
        </div>
      </form>
    </section>

    {stateMessage && <div className={sessionExpired ? styles.forbidden : styles.error} role="alert">{stateMessage}</div>}

    <section aria-labelledby="latest-posts-title">
      <div className={styles.listHeading}>
        <div><p className={styles.eyebrow}>社內動態</p><h2 id="latest-posts-title">最新留言</h2></div>
        <button className={styles.secondaryButton} onClick={() => void loadPosts(null, false)} disabled={loading}>重新整理</button>
      </div>

      {loading ? <div className={styles.state}>正在載入留言…</div> : posts.length === 0
        ? <div className={styles.state}><strong>目前還沒有留言</strong><span>成為本社第一位分享近況的人吧。</span></div>
        : <div className={styles.list}>{posts.map(post => {
          const editing = editingPostId === post.id;
          const pending = pendingPostId === post.id;
          const edited = post.updated_at !== post.created_at;
          return <article className={styles.post} key={post.id}>
            <header>
              <Avatar post={post} />
              <div><strong>{post.author_display_name}</strong><span>{formatTime(post.created_at)}{edited ? " · 已編輯" : ""}</span></div>
            </header>
            {editing ? <div className={styles.editor}>
              <textarea value={editingContent} onChange={event => setEditingContent(event.target.value)} rows={4} disabled={pending} />
              <div className={styles.editorActions}>
                <span>{boardContentLength(editingContent)} / {BOARD_CONTENT_MAX_CODE_POINTS}</span>
                <button className={styles.secondaryButton} onClick={() => setEditingPostId(null)} disabled={pending}>取消</button>
                <button onClick={() => void saveEdit(post.id)} disabled={pending}>{pending ? "儲存中…" : "儲存"}</button>
              </div>
            </div> : <p className={styles.content}>{post.content}</p>}
            {!editing && (post.can_edit || post.can_delete) && <footer>
              {post.can_edit && <button className={styles.textButton} onClick={() => beginEdit(post)} disabled={pending}>編輯</button>}
              {post.can_delete && <button className={styles.dangerButton} onClick={() => void remove(post.id)} disabled={pending}>{pending ? "處理中…" : "刪除"}</button>}
            </footer>}
          </article>;
        })}</div>}

      {cursor && !loading && <div className={styles.loadMore}><button className={styles.secondaryButton} onClick={() => void loadPosts(cursor, true)} disabled={loadingMore}>{loadingMore ? "載入中…" : "載入更多"}</button></div>}
    </section>
  </div>;
}

export type BoardPost = {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author_display_name: string;
  author_avatar_url: string | null;
  can_edit: boolean;
  can_delete: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseBoardPostProjection(value: unknown): BoardPost {
  if (!isRecord(value)) throw new Error("invalid_board_projection");
  const avatar = value.author_avatar_url;
  if (
    typeof value.id !== "string"
    || typeof value.content !== "string"
    || typeof value.created_at !== "string"
    || typeof value.updated_at !== "string"
    || typeof value.author_display_name !== "string"
    || (avatar !== null && typeof avatar !== "string")
    || typeof value.can_edit !== "boolean"
    || typeof value.can_delete !== "boolean"
  ) {
    throw new Error("invalid_board_projection");
  }

  return {
    id: value.id,
    content: value.content,
    created_at: value.created_at,
    updated_at: value.updated_at,
    author_display_name: value.author_display_name,
    author_avatar_url: avatar,
    can_edit: value.can_edit,
    can_delete: value.can_delete,
  };
}

export function parseBoardListProjection(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.posts)) throw new Error("invalid_board_projection");
  return {
    posts: value.posts.map(parseBoardPostProjection),
    nextCursorPayload: value.next_cursor ?? null,
  };
}

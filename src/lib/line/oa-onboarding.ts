export const lineOaFriendStatuses = ["unknown", "following", "unfollowed"] as const;
export type LineOaFriendStatus = (typeof lineOaFriendStatuses)[number];

export const lineOaPairStatuses = ["unpaired", "pending", "paired", "conflict"] as const;
export type LineOaPairStatus = (typeof lineOaPairStatuses)[number];

export type LineOaOnboardingStatus = Readonly<{
  clubId: string;
  clubName: string;
  oaAvailable: boolean;
  joinUrl: string | null;
  friendStatus: LineOaFriendStatus;
  pairStatus: LineOaPairStatus;
  lineLoginBound: boolean;
  dismissalCount: number;
  nextPromptAfter: string | null;
}>;

export type LineOaHomePrompt = "full" | "banner" | "quiet" | "hidden";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const friendStatuses = new Set<string>(lineOaFriendStatuses);
const pairStatuses = new Set<string>(lineOaPairStatuses);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  return actual.length === allowed.length && actual.every((key, index) => key === allowed[index]);
}

function isSafeJoinUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 300) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "line.me"
      && url.pathname.startsWith("/R/ti/p/")
      && url.username === ""
      && url.password === ""
      && url.search === ""
      && url.hash === "";
  } catch {
    return false;
  }
}

function isIsoDateTime(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function parseLineOaOnboardingStatus(value: unknown): LineOaOnboardingStatus | null {
  if (!isRecord(value)
    || !hasExactKeys(value, [
      "club_id",
      "club_name",
      "oa_available",
      "join_url",
      "friend_status",
      "pair_status",
      "line_login_bound",
      "dismissal_count",
      "next_prompt_after",
    ])
    || typeof value.club_id !== "string"
    || !uuidPattern.test(value.club_id)
    || typeof value.club_name !== "string"
    || value.club_name.length === 0
    || value.club_name.length > 300
    || typeof value.oa_available !== "boolean"
    || typeof value.friend_status !== "string"
    || !friendStatuses.has(value.friend_status)
    || typeof value.pair_status !== "string"
    || !pairStatuses.has(value.pair_status)
    || typeof value.line_login_bound !== "boolean"
    || typeof value.dismissal_count !== "number"
    || !Number.isInteger(value.dismissal_count)
    || value.dismissal_count < 0
    || value.dismissal_count > 3
    || (value.next_prompt_after !== null && !isIsoDateTime(value.next_prompt_after))) {
    return null;
  }

  if (value.oa_available ? !isSafeJoinUrl(value.join_url) : value.join_url !== null) return null;
  if (value.pair_status === "paired" && value.friend_status !== "following") return null;

  return {
    clubId: value.club_id,
    clubName: value.club_name,
    oaAvailable: value.oa_available,
    joinUrl: value.join_url as string | null,
    friendStatus: value.friend_status as LineOaFriendStatus,
    pairStatus: value.pair_status as LineOaPairStatus,
    lineLoginBound: value.line_login_bound,
    dismissalCount: value.dismissal_count,
    nextPromptAfter: value.next_prompt_after as string | null,
  };
}

export function lineOaHomePrompt(
  status: LineOaOnboardingStatus,
  now = new Date(),
): LineOaHomePrompt {
  if (!status.oaAvailable || status.pairStatus === "paired" || status.dismissalCount >= 3) return "hidden";
  if (status.nextPromptAfter !== null && new Date(status.nextPromptAfter).getTime() > now.getTime()) return "hidden";
  if (status.dismissalCount === 0) return "full";
  return status.dismissalCount === 1 ? "banner" : "quiet";
}

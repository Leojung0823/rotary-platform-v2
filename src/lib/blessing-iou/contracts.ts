export type BlessingIouClub = Readonly<{
  clubId: string;
  clubCode: string;
  clubName: string;
  allowPublicAmounts: boolean;
  canManage: boolean;
}>;

export type BlessingIouEntry = Readonly<{
  id: string;
  blessingText: string;
  pledgedAmount: number | null;
  hasPledge: boolean;
  currencyCode: string;
  amountIsPublic: boolean;
  pledgedOn: string;
  createdAt: string;
  updatedAt: string;
  authorDisplayName: string;
  authorAvatarUrl: string | null;
  canEdit: boolean;
  canDelete: boolean;
  viewerCanManage: boolean;
}>;

export type BlessingIouManagementContext = Readonly<{
  clubId: string;
  clubCode: string;
  clubName: string;
  allowPublicAmounts: boolean;
}>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function isAmount(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 1
    && value <= 9_999_999_999;
}

export function parseBlessingIouClub(value: unknown): BlessingIouClub {
  if (!isRecord(value)
    || typeof value.club_id !== "string"
    || !uuidPattern.test(value.club_id)
    || typeof value.club_code !== "string"
    || value.club_code.length < 1
    || value.club_code.length > 100
    || typeof value.club_name !== "string"
    || value.club_name.length < 1
    || value.club_name.length > 300
    || typeof value.allow_public_amounts !== "boolean"
    || typeof value.can_manage !== "boolean") {
    throw new Error("invalid_blessing_iou_club_projection");
  }
  return {
    clubId: value.club_id,
    clubCode: value.club_code,
    clubName: value.club_name,
    allowPublicAmounts: value.allow_public_amounts,
    canManage: value.can_manage,
  };
}

export function parseBlessingIouClubs(value: unknown): readonly BlessingIouClub[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new Error("invalid_blessing_iou_club_projection");
  }
  const clubs = value.map(parseBlessingIouClub);
  if (new Set(clubs.map((club) => club.clubId)).size !== clubs.length) {
    throw new Error("invalid_blessing_iou_club_projection");
  }
  return clubs;
}

export function parseBlessingIouEntry(value: unknown): BlessingIouEntry {
  if (!isRecord(value)) throw new Error("invalid_blessing_iou_entry_projection");
  const amount = value.pledged_amount;
  const avatar = value.author_avatar_url;
  if (typeof value.id !== "string"
    || !uuidPattern.test(value.id)
    || typeof value.blessing_text !== "string"
    || value.blessing_text.length < 1
    || value.blessing_text.length > 1000
    || (amount !== null && !isAmount(amount))
    || typeof value.has_pledge !== "boolean"
    || typeof value.currency_code !== "string"
    || !/^[A-Z]{3}$/u.test(value.currency_code)
    || typeof value.amount_is_public !== "boolean"
    || typeof value.pledged_on !== "string"
    || !datePattern.test(value.pledged_on)
    || !isTimestamp(value.created_at)
    || !isTimestamp(value.updated_at)
    || typeof value.author_display_name !== "string"
    || value.author_display_name.length < 1
    || value.author_display_name.length > 300
    || (avatar !== null && typeof avatar !== "string")
    || typeof value.can_edit !== "boolean"
    || typeof value.can_delete !== "boolean"
    || typeof value.viewer_can_manage !== "boolean") {
    throw new Error("invalid_blessing_iou_entry_projection");
  }
  if (!value.has_pledge && amount !== null) {
    throw new Error("invalid_blessing_iou_entry_projection");
  }
  if (value.amount_is_public && (!value.has_pledge || amount === null)) {
    throw new Error("invalid_blessing_iou_entry_projection");
  }
  return {
    id: value.id,
    blessingText: value.blessing_text,
    pledgedAmount: amount,
    hasPledge: value.has_pledge,
    currencyCode: value.currency_code,
    amountIsPublic: value.amount_is_public,
    pledgedOn: value.pledged_on,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    authorDisplayName: value.author_display_name,
    authorAvatarUrl: avatar,
    canEdit: value.can_edit,
    canDelete: value.can_delete,
    viewerCanManage: value.viewer_can_manage,
  };
}

export function parseBlessingIouListProjection(value: unknown) {
  if (!isRecord(value)
    || !Array.isArray(value.entries)
    || value.entries.length > 50
    || typeof value.viewer_can_manage !== "boolean") {
    throw new Error("invalid_blessing_iou_list_projection");
  }
  const entries = value.entries.map(parseBlessingIouEntry);
  if (entries.some((entry) => entry.viewerCanManage !== value.viewer_can_manage)) {
    throw new Error("invalid_blessing_iou_list_projection");
  }
  return {
    entries,
    nextCursorPayload: value.next_cursor ?? null,
    viewerCanManage: value.viewer_can_manage,
  };
}

export function parseBlessingIouManagementContext(value: unknown): BlessingIouManagementContext {
  if (!isRecord(value)
    || typeof value.club_id !== "string"
    || !uuidPattern.test(value.club_id)
    || typeof value.club_code !== "string"
    || value.club_code.length < 1
    || value.club_code.length > 100
    || typeof value.club_name !== "string"
    || value.club_name.length < 1
    || value.club_name.length > 300
    || typeof value.allow_public_amounts !== "boolean") {
    throw new Error("invalid_blessing_iou_management_projection");
  }
  return {
    clubId: value.club_id,
    clubCode: value.club_code,
    clubName: value.club_name,
    allowPublicAmounts: value.allow_public_amounts,
  };
}

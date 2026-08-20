export const blessingIouCollectionStatuses = ["unpaid", "partial", "paid"] as const;
export type BlessingIouCollectionStatus = (typeof blessingIouCollectionStatuses)[number];

export const blessingIouPaymentMethods = ["cash", "transfer", "check", "other"] as const;
export type BlessingIouPaymentMethod = (typeof blessingIouPaymentMethods)[number];

export type BlessingIouCollectionEntry = Readonly<{
  entryId: string;
  authorMembershipId: string;
  authorDisplayName: string;
  blessingText: string;
  pledgedOn: string;
  createdAt: string;
  pledgedAmount: number;
  receivedAmount: number;
  outstandingAmount: number;
  collectionStatus: BlessingIouCollectionStatus;
}>;

export type BlessingIouCollectionRecord = Readonly<{
  collectionId: string;
  entryId: string;
  authorDisplayName: string;
  amountReceived: number;
  receivedOn: string;
  paymentMethod: BlessingIouPaymentMethod;
  referenceNote: string | null;
  collectionStatus: "posted" | "reversed";
  createdAt: string;
  reversedAt: string | null;
  reversalReason: string | null;
}>;

export type BlessingIouCollectionSummary = Readonly<{
  pledgedAmount: number;
  receivedAmount: number;
  outstandingAmount: number;
  entryCount: number;
  unpaidEntryCount: number;
  partialEntryCount: number;
  paidEntryCount: number;
}>;

export type BlessingIouCollectionContext = Readonly<{
  clubId: string;
  clubCode: string;
  clubName: string;
  periodMonth: string;
  currencyCode: "TWD";
  summary: BlessingIouCollectionSummary;
  entries: readonly BlessingIouCollectionEntry[];
  collections: readonly BlessingIouCollectionRecord[];
}>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
const monthPattern = /^\d{4}-\d{2}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function isInteger(value: unknown, minimum = 0): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= minimum;
}

function isBoundedText(value: unknown, maximum: number, minimum = 1): value is string {
  return typeof value === "string"
    && Array.from(value).length >= minimum
    && Array.from(value).length <= maximum;
}

function parseEntry(value: unknown): BlessingIouCollectionEntry {
  if (!isRecord(value)
    || typeof value.entry_id !== "string"
    || !uuidPattern.test(value.entry_id)
    || typeof value.author_membership_id !== "string"
    || !uuidPattern.test(value.author_membership_id)
    || !isBoundedText(value.author_display_name, 300)
    || !isBoundedText(value.blessing_text, 1000)
    || typeof value.pledged_on !== "string"
    || !datePattern.test(value.pledged_on)
    || !isTimestamp(value.created_at)
    || !isInteger(value.pledged_amount, 1)
    || !isInteger(value.received_amount)
    || !isInteger(value.outstanding_amount)
    || !blessingIouCollectionStatuses.includes(value.collection_status as BlessingIouCollectionStatus)
    || value.received_amount + value.outstanding_amount !== value.pledged_amount) {
    throw new Error("invalid_blessing_iou_collection_entry");
  }
  const expectedStatus: BlessingIouCollectionStatus = value.received_amount === 0
    ? "unpaid"
    : value.outstanding_amount === 0 ? "paid" : "partial";
  if (value.collection_status !== expectedStatus) {
    throw new Error("invalid_blessing_iou_collection_entry");
  }
  return {
    entryId: value.entry_id,
    authorMembershipId: value.author_membership_id,
    authorDisplayName: value.author_display_name,
    blessingText: value.blessing_text,
    pledgedOn: value.pledged_on,
    createdAt: value.created_at,
    pledgedAmount: value.pledged_amount,
    receivedAmount: value.received_amount,
    outstandingAmount: value.outstanding_amount,
    collectionStatus: value.collection_status as BlessingIouCollectionStatus,
  };
}

function parseCollection(value: unknown): BlessingIouCollectionRecord {
  if (!isRecord(value)
    || typeof value.collection_id !== "string"
    || !uuidPattern.test(value.collection_id)
    || typeof value.entry_id !== "string"
    || !uuidPattern.test(value.entry_id)
    || !isBoundedText(value.author_display_name, 300)
    || !isInteger(value.amount_received, 1)
    || typeof value.received_on !== "string"
    || !datePattern.test(value.received_on)
    || !blessingIouPaymentMethods.includes(value.payment_method as BlessingIouPaymentMethod)
    || (value.reference_note !== null && !isBoundedText(value.reference_note, 300))
    || (value.collection_status !== "posted" && value.collection_status !== "reversed")
    || !isTimestamp(value.created_at)
    || (value.reversed_at !== null && !isTimestamp(value.reversed_at))
    || (value.reversal_reason !== null && !isBoundedText(value.reversal_reason, 300, 2))) {
    throw new Error("invalid_blessing_iou_collection_record");
  }
  const reversed = value.collection_status === "reversed";
  if (reversed
    ? value.reversed_at === null || value.reversal_reason === null
    : value.reversed_at !== null || value.reversal_reason !== null) {
    throw new Error("invalid_blessing_iou_collection_record");
  }
  return {
    collectionId: value.collection_id,
    entryId: value.entry_id,
    authorDisplayName: value.author_display_name,
    amountReceived: value.amount_received,
    receivedOn: value.received_on,
    paymentMethod: value.payment_method as BlessingIouPaymentMethod,
    referenceNote: value.reference_note as string | null,
    collectionStatus: value.collection_status,
    createdAt: value.created_at,
    reversedAt: value.reversed_at as string | null,
    reversalReason: value.reversal_reason as string | null,
  };
}

function parseSummary(value: unknown): BlessingIouCollectionSummary {
  if (!isRecord(value)
    || !isInteger(value.pledged_amount)
    || !isInteger(value.received_amount)
    || !isInteger(value.outstanding_amount)
    || !isInteger(value.entry_count)
    || !isInteger(value.unpaid_entry_count)
    || !isInteger(value.partial_entry_count)
    || !isInteger(value.paid_entry_count)
    || value.received_amount + value.outstanding_amount !== value.pledged_amount
    || value.unpaid_entry_count + value.partial_entry_count + value.paid_entry_count !== value.entry_count) {
    throw new Error("invalid_blessing_iou_collection_summary");
  }
  return {
    pledgedAmount: value.pledged_amount,
    receivedAmount: value.received_amount,
    outstandingAmount: value.outstanding_amount,
    entryCount: value.entry_count,
    unpaidEntryCount: value.unpaid_entry_count,
    partialEntryCount: value.partial_entry_count,
    paidEntryCount: value.paid_entry_count,
  };
}

export function parseBlessingIouCollectionContext(value: unknown): BlessingIouCollectionContext {
  if (!isRecord(value)
    || typeof value.club_id !== "string"
    || !uuidPattern.test(value.club_id)
    || !isBoundedText(value.club_code, 100)
    || !isBoundedText(value.club_name, 300)
    || typeof value.period_month !== "string"
    || !monthPattern.test(value.period_month)
    || value.currency_code !== "TWD"
    || !Array.isArray(value.entries)
    || value.entries.length > 5000
    || !Array.isArray(value.collections)
    || value.collections.length > 100) {
    throw new Error("invalid_blessing_iou_collection_context");
  }
  const entries = value.entries.map(parseEntry);
  const collections = value.collections.map(parseCollection);
  if (new Set(entries.map((entry) => entry.entryId)).size !== entries.length) {
    throw new Error("invalid_blessing_iou_collection_context");
  }
  const summary = parseSummary(value.summary);
  if (summary.entryCount !== entries.length) {
    throw new Error("invalid_blessing_iou_collection_context");
  }
  return {
    clubId: value.club_id,
    clubCode: value.club_code,
    clubName: value.club_name,
    periodMonth: value.period_month,
    currencyCode: "TWD",
    summary,
    entries,
    collections,
  };
}

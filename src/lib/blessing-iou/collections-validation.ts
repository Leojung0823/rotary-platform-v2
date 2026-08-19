import { BLESSING_IOU_MAX_AMOUNT, blessingTextLength } from "./validation";
import { blessingIouPaymentMethods, type BlessingIouPaymentMethod } from "./collections-contracts";

export const BLESSING_IOU_COLLECTION_BATCH_MAX_ITEMS = 50;
export const BLESSING_IOU_COLLECTION_NOTE_MAX_CODE_POINTS = 300;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const monthPattern = /^(\d{4})-(\d{2})$/u;
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function validCalendarDate(value: string, pattern: RegExp) {
  const match = value.match(pattern);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = match[3] === undefined ? 1 : Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function parseCollectionPeriodMonth(value: unknown) {
  if (typeof value !== "string" || !validCalendarDate(value, monthPattern)) {
    throw new Error("invalid_blessing_iou_period_month");
  }
  return `${value}-01`;
}

export function periodMonthLabel(value: string) {
  const date = parseCollectionPeriodMonth(value);
  return date.slice(0, 7);
}

export function parseCollectionReceivedOn(value: unknown) {
  if (typeof value !== "string" || !validCalendarDate(value, datePattern)) {
    throw new Error("invalid_blessing_iou_received_on");
  }
  return value;
}

export function parseCollectionId(value: string) {
  if (!uuidPattern.test(value)) throw new Error("invalid_blessing_iou_collection_id");
  return value.toLowerCase();
}

function parsePaymentMethod(value: unknown): BlessingIouPaymentMethod {
  if (typeof value !== "string"
    || !blessingIouPaymentMethods.includes(value as BlessingIouPaymentMethod)) {
    throw new Error("invalid_blessing_iou_payment_method");
  }
  return value as BlessingIouPaymentMethod;
}

function parseReferenceNote(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error("invalid_blessing_iou_reference_note");
  const normalized = value.trim();
  if (normalized === "") return null;
  if (blessingTextLength(normalized) > BLESSING_IOU_COLLECTION_NOTE_MAX_CODE_POINTS) {
    throw new Error("invalid_blessing_iou_reference_note");
  }
  return normalized;
}

function parseCollectionItems(value: unknown) {
  if (!Array.isArray(value)
    || value.length < 1
    || value.length > BLESSING_IOU_COLLECTION_BATCH_MAX_ITEMS) {
    throw new Error("invalid_blessing_iou_collection_items");
  }
  const entries = value.map((item) => {
    if (!isRecord(item)
      || !hasExactKeys(item, ["amount", "entryId"])
      || typeof item.entryId !== "string"
      || !uuidPattern.test(item.entryId)
      || typeof item.amount !== "number"
      || !Number.isSafeInteger(item.amount)
      || item.amount < 1
      || item.amount > BLESSING_IOU_MAX_AMOUNT) {
      throw new Error("invalid_blessing_iou_collection_items");
    }
    return { entry_id: item.entryId.toLowerCase(), amount: item.amount };
  });
  if (new Set(entries.map((entry) => entry.entry_id)).size !== entries.length) {
    throw new Error("invalid_blessing_iou_collection_items");
  }
  return entries;
}

export function parseCollectionBatchBody(value: unknown) {
  if (!isRecord(value)
    || !hasExactKeys(value, ["items", "paymentMethod", "periodMonth", "receivedOn", "referenceNote"])) {
    throw new Error("invalid_blessing_iou_collection_body");
  }
  return {
    periodMonth: parseCollectionPeriodMonth(value.periodMonth),
    receivedOn: parseCollectionReceivedOn(value.receivedOn),
    paymentMethod: parsePaymentMethod(value.paymentMethod),
    referenceNote: parseReferenceNote(value.referenceNote),
    items: parseCollectionItems(value.items),
  };
}

export function parseCollectionReversalBody(value: unknown) {
  if (!isRecord(value) || !hasExactKeys(value, ["periodMonth", "reason"])) {
    throw new Error("invalid_blessing_iou_reversal_body");
  }
  if (typeof value.reason !== "string") throw new Error("invalid_blessing_iou_reversal_body");
  const reason = value.reason.trim();
  const length = blessingTextLength(reason);
  if (length < 2 || length > BLESSING_IOU_COLLECTION_NOTE_MAX_CODE_POINTS) {
    throw new Error("invalid_blessing_iou_reversal_body");
  }
  return { periodMonth: parseCollectionPeriodMonth(value.periodMonth), reason };
}

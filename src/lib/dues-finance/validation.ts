import { duesFinancePaymentMethods, type DuesFinancePaymentMethod } from "./contracts";

export const DUES_FINANCE_REQUEST_MAX_BYTES = 64 * 1024;
export const DUES_FINANCE_TEXT_MAX_LENGTH = 1000;
export const DUES_FINANCE_REASON_MAX_LENGTH = 500;
export const DUES_FINANCE_IDEMPOTENCY_MAX_LENGTH = 160;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;

export type DuesFinanceMutation =
  | Readonly<{ action: "set_annual_default"; clubId: string; rotaryYearId: string; defaultAmount: number; reason: string | null }>
  | Readonly<{ action: "generate_receivables"; clubId: string; rotaryYearId: string; sourceNote: string | null }>
  | Readonly<{ action: "create_receivable"; clubId: string; rotaryYearId: string; membershipId: string; amount: number; sourceNote: string; sourceKind: "manual" | "opening_balance"; idempotencyKey: string }>
  | Readonly<{ action: "adjust_receivable"; clubId: string; receivableId: string; amountDelta: number; reason: string; idempotencyKey: string }>
  | Readonly<{ action: "record_receipt"; clubId: string; receivedOn: string; paymentMethod: DuesFinancePaymentMethod; referenceNote: string | null; allocations: readonly Readonly<{ receivableId: string; amount: number }>[]; idempotencyKey: string }>
  | Readonly<{ action: "reverse_receipt"; clubId: string; receiptId: string; reason: string }>
  | Readonly<{ action: "submit_advance"; clubId: string; rotaryYearId: string; payerMembershipId: string | null; amount: number; description: string; incurredOn: string; idempotencyKey: string }>
  | Readonly<{ action: "return_advance"; clubId: string; advanceId: string; reason: string }>
  | Readonly<{ action: "resubmit_advance"; clubId: string; advanceId: string; note: string | null }>
  | Readonly<{ action: "approve_reconciliation"; clubId: string; advanceId: string; amount: number; approvalNote: string | null; idempotencyKey: string }>
  | Readonly<{ action: "reverse_reconciliation"; clubId: string; reconciliationId: string; reason: string }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function uuid(value: unknown, code = "invalid_dues_finance_input") {
  if (typeof value !== "string" || !uuidPattern.test(value.trim())) throw new Error(code);
  return value.trim().toLowerCase();
}

function nullableUuid(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return uuid(value);
}

function text(value: unknown, maximum: number, minimum = 0) {
  if (typeof value !== "string") throw new Error("invalid_dues_finance_input");
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) throw new Error("invalid_dues_finance_input");
  return normalized;
}

function nullableText(value: unknown, maximum: number) {
  if (value === null || value === undefined || value === "") return null;
  return text(value, maximum);
}

function integer(value: unknown, minimum: number, maximum: number) {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^-?\d+$/u.test(value.trim())
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error("invalid_dues_finance_input");
  }
  return parsed;
}

function date(value: unknown) {
  const normalized = text(value, 10, 10);
  if (!datePattern.test(normalized)) throw new Error("invalid_dues_finance_input");
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new Error("invalid_dues_finance_input");
  }
  return normalized;
}

function idempotencyKey(value: unknown) {
  return text(value, DUES_FINANCE_IDEMPOTENCY_MAX_LENGTH, 1);
}

function parseAllocations(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new Error("invalid_dues_finance_input");
  }
  const allocations = value.map((entry) => {
    if (!isRecord(entry) || !exactKeys(entry, ["receivableId", "amount"])) {
      throw new Error("invalid_dues_finance_input");
    }
    return {
      receivableId: uuid(entry.receivableId),
      amount: integer(entry.amount, 1, 9_999_999_999),
    };
  });
  if (new Set(allocations.map((entry) => entry.receivableId)).size !== allocations.length) {
    throw new Error("invalid_dues_finance_input");
  }
  return allocations;
}

export function parseDuesFinanceMutationBody(value: unknown): DuesFinanceMutation {
  if (!isRecord(value) || typeof value.action !== "string" || typeof value.clubId !== "string") {
    throw new Error("invalid_dues_finance_input");
  }
  const clubId = uuid(value.clubId);
  switch (value.action) {
    case "set_annual_default":
      if (!exactKeys(value, ["action", "clubId", "rotaryYearId", "defaultAmount", "reason"])) throw new Error("invalid_dues_finance_input");
      return { action: value.action, clubId, rotaryYearId: uuid(value.rotaryYearId), defaultAmount: integer(value.defaultAmount, 1, 9_999_999_999), reason: nullableText(value.reason, DUES_FINANCE_REASON_MAX_LENGTH) };
    case "generate_receivables":
      if (!exactKeys(value, ["action", "clubId", "rotaryYearId", "sourceNote"])) throw new Error("invalid_dues_finance_input");
      return { action: value.action, clubId, rotaryYearId: uuid(value.rotaryYearId), sourceNote: nullableText(value.sourceNote, DUES_FINANCE_REASON_MAX_LENGTH) };
    case "create_receivable": {
      if (!exactKeys(value, ["action", "clubId", "rotaryYearId", "membershipId", "amount", "sourceNote", "sourceKind", "idempotencyKey"])) throw new Error("invalid_dues_finance_input");
      const sourceKind = value.sourceKind === "manual" || value.sourceKind === "opening_balance" ? value.sourceKind : (() => { throw new Error("invalid_dues_finance_input"); })();
      return { action: value.action, clubId, rotaryYearId: uuid(value.rotaryYearId), membershipId: uuid(value.membershipId), amount: integer(value.amount, 1, 9_999_999_999), sourceNote: text(value.sourceNote, 500, 2), sourceKind, idempotencyKey: idempotencyKey(value.idempotencyKey) };
    }
    case "adjust_receivable":
      if (!exactKeys(value, ["action", "clubId", "receivableId", "amountDelta", "reason", "idempotencyKey"])) throw new Error("invalid_dues_finance_input");
      return { action: value.action, clubId, receivableId: uuid(value.receivableId), amountDelta: integer(value.amountDelta, -9_999_999_999, 9_999_999_999) || (() => { throw new Error("invalid_dues_finance_input"); })(), reason: text(value.reason, DUES_FINANCE_REASON_MAX_LENGTH, 2), idempotencyKey: idempotencyKey(value.idempotencyKey) };
    case "record_receipt": {
      if (!exactKeys(value, ["action", "clubId", "receivedOn", "paymentMethod", "referenceNote", "allocations", "idempotencyKey"])) throw new Error("invalid_dues_finance_input");
      if (!duesFinancePaymentMethods.includes(value.paymentMethod as DuesFinancePaymentMethod)) throw new Error("invalid_dues_finance_input");
      return { action: value.action, clubId, receivedOn: date(value.receivedOn), paymentMethod: value.paymentMethod as DuesFinancePaymentMethod, referenceNote: nullableText(value.referenceNote, 500), allocations: parseAllocations(value.allocations), idempotencyKey: idempotencyKey(value.idempotencyKey) };
    }
    case "reverse_receipt":
      if (!exactKeys(value, ["action", "clubId", "receiptId", "reason"])) throw new Error("invalid_dues_finance_input");
      return { action: value.action, clubId, receiptId: uuid(value.receiptId), reason: text(value.reason, DUES_FINANCE_REASON_MAX_LENGTH, 2) };
    case "submit_advance":
      if (!exactKeys(value, ["action", "clubId", "rotaryYearId", "payerMembershipId", "amount", "description", "incurredOn", "idempotencyKey"])) throw new Error("invalid_dues_finance_input");
      return { action: value.action, clubId, rotaryYearId: uuid(value.rotaryYearId), payerMembershipId: nullableUuid(value.payerMembershipId), amount: integer(value.amount, 1, 9_999_999_999), description: text(value.description, DUES_FINANCE_TEXT_MAX_LENGTH, 2), incurredOn: date(value.incurredOn), idempotencyKey: idempotencyKey(value.idempotencyKey) };
    case "return_advance":
      if (!exactKeys(value, ["action", "clubId", "advanceId", "reason"])) throw new Error("invalid_dues_finance_input");
      return { action: value.action, clubId, advanceId: uuid(value.advanceId), reason: text(value.reason, DUES_FINANCE_REASON_MAX_LENGTH, 2) };
    case "resubmit_advance":
      if (!exactKeys(value, ["action", "clubId", "advanceId", "note"])) throw new Error("invalid_dues_finance_input");
      return { action: value.action, clubId, advanceId: uuid(value.advanceId), note: nullableText(value.note, DUES_FINANCE_REASON_MAX_LENGTH) };
    case "approve_reconciliation":
      if (!exactKeys(value, ["action", "clubId", "advanceId", "amount", "approvalNote", "idempotencyKey"])) throw new Error("invalid_dues_finance_input");
      return { action: value.action, clubId, advanceId: uuid(value.advanceId), amount: integer(value.amount, 1, 9_999_999_999), approvalNote: nullableText(value.approvalNote, DUES_FINANCE_REASON_MAX_LENGTH), idempotencyKey: idempotencyKey(value.idempotencyKey) };
    case "reverse_reconciliation":
      if (!exactKeys(value, ["action", "clubId", "reconciliationId", "reason"])) throw new Error("invalid_dues_finance_input");
      return { action: value.action, clubId, reconciliationId: uuid(value.reconciliationId), reason: text(value.reason, DUES_FINANCE_REASON_MAX_LENGTH, 2) };
    default:
      throw new Error("invalid_dues_finance_input");
  }
}

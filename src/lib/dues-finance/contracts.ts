export const duesFinancePaymentMethods = ["cash", "bank_transfer", "check", "other"] as const;
export type DuesFinancePaymentMethod = (typeof duesFinancePaymentMethods)[number];

export const duesFinanceReceivableStatuses = ["unpaid", "partial", "paid"] as const;
export type DuesFinanceReceivableStatus = (typeof duesFinanceReceivableStatuses)[number];

export const duesFinanceAdvanceStatuses = ["submitted", "returned", "closed"] as const;
export type DuesFinanceAdvanceStatus = (typeof duesFinanceAdvanceStatuses)[number];

export type DuesFinanceYear = Readonly<{
  id: string;
  clubId: string;
  startYear: number;
  label: string;
}>;

export type DuesFinanceAnnualDefault = Readonly<{
  clubId: string;
  rotaryYearId: string;
  defaultAmount: number;
  currencyCode: "TWD";
  updatedAt: string;
}>;

export type DuesFinanceSummary = Readonly<{
  receivableAmount: number;
  receivedAmount: number;
  outstandingAmount: number;
  advanceAmount: number;
  reconciledAmount: number;
  advanceOutstandingAmount: number;
}>;

export type DuesFinanceReceivable = Readonly<{
  receivableId: string;
  clubId: string;
  rotaryYearId: string;
  membershipId: string;
  memberDisplayName: string;
  baseAmount: number;
  adjustmentAmount: number;
  receivableAmount: number;
  receivedAmount: number;
  outstandingAmount: number;
  status: DuesFinanceReceivableStatus;
  sourceKind: "annual_default" | "manual" | "opening_balance";
  sourceNote: string;
  createdAt: string;
}>;

export type DuesFinanceReceiptAllocation = Readonly<{
  receivableId: string;
  membershipId: string | null;
  memberDisplayName: string | null;
  amount: number;
}>;

export type DuesFinanceReceipt = Readonly<{
  receiptId: string;
  amount: number;
  currencyCode: "TWD";
  receivedOn: string;
  paymentMethod: DuesFinancePaymentMethod;
  referenceNote: string | null;
  status: "posted" | "reversed";
  recordedByAppAccountId: string | null;
  createdAt: string;
  allocations: readonly DuesFinanceReceiptAllocation[];
}>;

export type DuesFinanceAdvance = Readonly<{
  advanceId: string;
  clubId: string;
  rotaryYearId: string;
  payerMembershipId: string;
  payerDisplayName: string;
  amount: number;
  reconciledAmount: number;
  outstandingAmount: number;
  advanceStatus: DuesFinanceAdvanceStatus;
  submissionCount: number;
  description: string;
  incurredOn: string;
  createdAt: string;
  updatedAt: string;
  reconciliations: readonly DuesFinanceReconciliation[];
}>;

export type DuesFinanceReconciliation = Readonly<{
  reconciliationId: string;
  amount: number;
  approvalNote: string | null;
  approvedAt: string;
  status: "posted" | "reversed";
  reversalReason: string | null;
}>;

export type DuesFinanceManagementLedger = Readonly<{
  clubId: string;
  rotaryYearId: string;
  rotaryYearStart: number;
  rotaryYearLabel: string;
  summary: DuesFinanceSummary;
  receivables: readonly DuesFinanceReceivable[];
  receipts: readonly DuesFinanceReceipt[];
  advances: readonly DuesFinanceAdvance[];
}>;

export type DuesFinanceMemberLedger = Readonly<{
  clubId: string;
  rotaryYearId: string;
  rotaryYearStart: number;
  receivables: readonly DuesFinanceReceivable[];
  receipts: readonly DuesFinanceReceipt[];
  advances: readonly DuesFinanceAdvance[];
}>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uuid(value: unknown) {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw new Error("invalid_dues_finance_projection");
  return value.toLowerCase();
}

function text(value: unknown, maximum: number, minimum = 1) {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum) {
    throw new Error("invalid_dues_finance_projection");
  }
  return value;
}

function date(value: unknown) {
  return datePattern.test(text(value, 10, 10)) ? String(value) : (() => {
    throw new Error("invalid_dues_finance_projection");
  })();
}

function timestamp(value: unknown) {
  const result = text(value, 80);
  if (Number.isNaN(new Date(result).getTime())) throw new Error("invalid_dues_finance_projection");
  return result;
}

function integer(value: unknown, minimum: number, maximum: number) {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^-?\d+(?:\.0+)?$/u.test(value.trim())
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error("invalid_dues_finance_projection");
  }
  return parsed;
}

function nullableUuid(value: unknown) {
  return value === null || value === undefined ? null : uuid(value);
}

function nullableText(value: unknown, maximum: number) {
  if (value === null || value === undefined) return null;
  return text(value, maximum);
}

function parseYear(value: unknown): DuesFinanceYear {
  if (!isRecord(value)) throw new Error("invalid_dues_finance_year_projection");
  return {
    id: uuid(value.id),
    clubId: uuid(value.club_id),
    startYear: integer(value.start_year, 2000, 2200),
    label: text(value.rotary_year_label, 32),
  };
}

export function parseDuesFinanceYearList(value: unknown): readonly DuesFinanceYear[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("invalid_dues_finance_year_projection");
  const years = value.map(parseYear);
  if (new Set(years.map((year) => year.id)).size !== years.length) {
    throw new Error("invalid_dues_finance_year_projection");
  }
  return years;
}

export function parseDuesFinanceAnnualDefault(value: unknown): DuesFinanceAnnualDefault | null {
  if (value === null) return null;
  if (!isRecord(value) || value.currency_code !== "TWD") {
    throw new Error("invalid_dues_finance_default_projection");
  }
  return {
    clubId: uuid(value.club_id),
    rotaryYearId: uuid(value.rotary_year_id),
    defaultAmount: integer(value.default_amount, 1, 9_999_999_999),
    currencyCode: "TWD",
    updatedAt: timestamp(value.updated_at),
  };
}

function parseReceivable(value: unknown): DuesFinanceReceivable {
  if (!isRecord(value)) throw new Error("invalid_dues_finance_projection");
  const status = text(value.status, 16);
  const sourceKind = text(value.source_kind, 32);
  const parsed: DuesFinanceReceivable = {
    receivableId: uuid(value.receivable_id),
    clubId: uuid(value.club_id),
    rotaryYearId: uuid(value.rotary_year_id),
    membershipId: uuid(value.membership_id),
    memberDisplayName: text(value.member_display_name, 300),
    baseAmount: integer(value.base_amount, 1, 9_999_999_999),
    adjustmentAmount: integer(value.adjustment_amount, -9_999_999_999, 9_999_999_999),
    receivableAmount: integer(value.receivable_amount, 1, 9_999_999_999),
    receivedAmount: integer(value.received_amount, 0, 9_999_999_999),
    outstandingAmount: integer(value.outstanding_amount, 0, 9_999_999_999),
    status: duesFinanceReceivableStatuses.includes(status as DuesFinanceReceivableStatus)
      ? status as DuesFinanceReceivableStatus
      : (() => { throw new Error("invalid_dues_finance_projection"); })(),
    sourceKind: sourceKind === "annual_default" || sourceKind === "manual" || sourceKind === "opening_balance"
      ? sourceKind
      : (() => { throw new Error("invalid_dues_finance_projection"); })(),
    sourceNote: text(value.source_note, 500, 2),
    createdAt: timestamp(value.created_at),
  };
  if (parsed.receivableAmount !== parsed.baseAmount + parsed.adjustmentAmount
    || parsed.receivedAmount + parsed.outstandingAmount !== parsed.receivableAmount) {
    throw new Error("invalid_dues_finance_projection");
  }
  const expectedStatus = parsed.receivedAmount === 0
    ? "unpaid"
    : parsed.outstandingAmount === 0 ? "paid" : "partial";
  if (parsed.status !== expectedStatus) throw new Error("invalid_dues_finance_projection");
  return parsed;
}

function parseAllocation(value: unknown): DuesFinanceReceiptAllocation {
  if (!isRecord(value)) throw new Error("invalid_dues_finance_projection");
  return {
    receivableId: uuid(value.receivable_id),
    membershipId: nullableUuid(value.membership_id),
    memberDisplayName: nullableText(value.member_display_name, 300),
    amount: integer(value.amount, 1, 9_999_999_999),
  };
}

function parseReceipt(value: unknown): DuesFinanceReceipt {
  if (!isRecord(value)) throw new Error("invalid_dues_finance_projection");
  const paymentMethod = text(value.payment_method, 32);
  const status = text(value.status, 16);
  if (!duesFinancePaymentMethods.includes(paymentMethod as DuesFinancePaymentMethod)
    || (status !== "posted" && status !== "reversed")
    || !Array.isArray(value.allocations)
    || value.allocations.length > 500) {
    throw new Error("invalid_dues_finance_projection");
  }
  const allocations = value.allocations.map(parseAllocation);
  if (allocations.reduce((total, allocation) => total + allocation.amount, 0)
    !== integer(value.amount, 1, 9_999_999_999)) {
    throw new Error("invalid_dues_finance_projection");
  }
  return {
    receiptId: uuid(value.receipt_id),
    amount: integer(value.amount, 1, 9_999_999_999),
    currencyCode: value.currency_code === "TWD" ? "TWD" : (() => {
      throw new Error("invalid_dues_finance_projection");
    })(),
    receivedOn: date(value.received_on),
    paymentMethod: paymentMethod as DuesFinancePaymentMethod,
    referenceNote: nullableText(value.reference_note, 500),
    status: status as "posted" | "reversed",
    recordedByAppAccountId: nullableUuid(value.recorded_by_app_account_id),
    createdAt: timestamp(value.created_at),
    allocations,
  };
}

function parseAdvance(value: unknown): DuesFinanceAdvance {
  if (!isRecord(value)) throw new Error("invalid_dues_finance_projection");
  const status = text(value.advance_status, 16);
  if (!duesFinanceAdvanceStatuses.includes(status as DuesFinanceAdvanceStatus)) {
    throw new Error("invalid_dues_finance_projection");
  }
  if (!Array.isArray(value.reconciliations) || value.reconciliations.length > 100) {
    throw new Error("invalid_dues_finance_projection");
  }
  const reconciliations = value.reconciliations.map((entry): DuesFinanceReconciliation => {
    if (!isRecord(entry)) throw new Error("invalid_dues_finance_projection");
    const reconciliationStatus = text(entry.status, 16);
    if (reconciliationStatus !== "posted" && reconciliationStatus !== "reversed") {
      throw new Error("invalid_dues_finance_projection");
    }
    const reversalReason = nullableText(entry.reversal_reason, 500);
    if (reconciliationStatus === "reversed" && reversalReason === null) {
      throw new Error("invalid_dues_finance_projection");
    }
    if (reconciliationStatus === "posted" && reversalReason !== null) {
      throw new Error("invalid_dues_finance_projection");
    }
    return {
      reconciliationId: uuid(entry.reconciliation_id),
      amount: integer(entry.amount, 1, 9_999_999_999),
      approvalNote: nullableText(entry.approval_note, 500),
      approvedAt: timestamp(entry.approved_at),
      status: reconciliationStatus,
      reversalReason,
    };
  });
  const amount = integer(value.amount, 1, 9_999_999_999);
  const reconciledAmount = integer(value.reconciled_amount, 0, 9_999_999_999);
  const outstandingAmount = integer(value.outstanding_amount, 0, 9_999_999_999);
  const postedReconciledAmount = reconciliations
    .filter((entry) => entry.status === "posted")
    .reduce((total, entry) => total + entry.amount, 0);
  if (postedReconciledAmount !== reconciledAmount
    || reconciledAmount + outstandingAmount !== amount
    || (status === "closed" ? outstandingAmount !== 0 : outstandingAmount === 0)) {
    throw new Error("invalid_dues_finance_projection");
  }
  return {
    advanceId: uuid(value.advance_id),
    clubId: uuid(value.club_id),
    rotaryYearId: uuid(value.rotary_year_id),
    payerMembershipId: uuid(value.payer_membership_id),
    payerDisplayName: text(value.payer_display_name, 300),
    amount,
    reconciledAmount,
    outstandingAmount,
    advanceStatus: status as DuesFinanceAdvanceStatus,
    submissionCount: integer(value.submission_count, 1, 100000),
    description: text(value.description, 1000, 2),
    incurredOn: date(value.incurred_on),
    createdAt: timestamp(value.created_at),
    updatedAt: timestamp(value.updated_at),
    reconciliations,
  };
}

function parseSummary(value: unknown): DuesFinanceSummary {
  if (!isRecord(value)) throw new Error("invalid_dues_finance_projection");
  const summary = {
    receivableAmount: integer(value.receivable_amount, 0, 9_999_999_999),
    receivedAmount: integer(value.received_amount, 0, 9_999_999_999),
    outstandingAmount: integer(value.outstanding_amount, 0, 9_999_999_999),
    advanceAmount: integer(value.advance_amount, 0, 9_999_999_999),
    reconciledAmount: integer(value.reconciled_amount, 0, 9_999_999_999),
    advanceOutstandingAmount: integer(value.advance_outstanding_amount, 0, 9_999_999_999),
  };
  if (summary.receivedAmount + summary.outstandingAmount !== summary.receivableAmount
    || summary.reconciledAmount + summary.advanceOutstandingAmount !== summary.advanceAmount) {
    throw new Error("invalid_dues_finance_projection");
  }
  return summary;
}

function list(value: unknown, parser: (entry: unknown) => never | unknown, maximum: number) {
  if (!Array.isArray(value) || value.length > maximum) throw new Error("invalid_dues_finance_projection");
  return value.map(parser);
}

export function parseDuesFinanceManagementLedger(value: unknown): DuesFinanceManagementLedger {
  if (!isRecord(value)) throw new Error("invalid_dues_finance_projection");
  const receivables = list(value.receivables, parseReceivable, 500) as DuesFinanceReceivable[];
  const receipts = list(value.receipts, parseReceipt, 500) as DuesFinanceReceipt[];
  const advances = list(value.advances, parseAdvance, 500) as DuesFinanceAdvance[];
  const result = {
    clubId: uuid(value.club_id),
    rotaryYearId: uuid(value.rotary_year_id),
    rotaryYearStart: integer(value.rotary_year_start, 2000, 2200),
    rotaryYearLabel: text(value.rotary_year_label, 32),
    summary: parseSummary(value.summary),
    receivables,
    receipts,
    advances,
  };
  if (receivables.some((item) => item.clubId !== result.clubId || item.rotaryYearId !== result.rotaryYearId)
    || advances.some((item) => item.clubId !== result.clubId || item.rotaryYearId !== result.rotaryYearId)) {
    throw new Error("invalid_dues_finance_projection");
  }
  return result;
}

export function parseDuesFinanceMemberLedger(value: unknown): DuesFinanceMemberLedger {
  if (!isRecord(value)) throw new Error("invalid_dues_finance_projection");
  const receivables = list(value.receivables, parseReceivable, 500) as DuesFinanceReceivable[];
  const receipts = list(value.receipts, parseReceipt, 500) as DuesFinanceReceipt[];
  const advances = list(value.advances, parseAdvance, 500) as DuesFinanceAdvance[];
  const result = {
    clubId: uuid(value.club_id),
    rotaryYearId: uuid(value.rotary_year_id),
    rotaryYearStart: integer(value.rotary_year_start, 2000, 2200),
    receivables,
    receipts,
    advances,
  };
  if (receivables.some((item) => item.clubId !== result.clubId || item.rotaryYearId !== result.rotaryYearId)
    || advances.some((item) => item.clubId !== result.clubId || item.rotaryYearId !== result.rotaryYearId)) {
    throw new Error("invalid_dues_finance_projection");
  }
  return result;
}

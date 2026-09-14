import type {
  DuesFinancePaymentMethod,
} from "./contracts";

export type DuesFinanceReportSummary = Readonly<{
  memberCount: number;
  receivableCount: number;
  receivableAmount: number;
  receivedAmount: number;
  outstandingAmount: number;
  unpaidCount: number;
  partialCount: number;
  paidCount: number;
  receiptCount: number;
  receivedByMethodAmount: number;
  advanceCount: number;
  advanceAmount: number;
  reconciledAmount: number;
  advanceOutstandingAmount: number;
}>;

export type DuesFinanceReportMonth = Readonly<{
  month: string;
  receiptCount: number;
  receivedAmount: number;
}>;

export type DuesFinanceReportPaymentMethod = Readonly<{
  paymentMethod: DuesFinancePaymentMethod;
  receiptCount: number;
  receivedAmount: number;
}>;

export type DuesFinanceReportMember = Readonly<{
  memberDisplayName: string;
  receivableCount: number;
  receivableAmount: number;
  receivedAmount: number;
  outstandingAmount: number;
  unpaidCount: number;
  partialCount: number;
  paidCount: number;
}>;

export type DuesFinanceReportAdvance = Readonly<{
  memberDisplayName: string;
  amount: number;
  reconciledAmount: number;
  outstandingAmount: number;
  advanceStatus: "submitted" | "returned" | "closed";
}>;

export type DuesFinanceReport = Readonly<{
  clubId: string;
  rotaryYearId: string;
  rotaryYearStart: number;
  rotaryYearLabel: string;
  startsOn: string;
  endsOn: string;
  currencyCode: "TWD";
  summary: DuesFinanceReportSummary;
  months: readonly DuesFinanceReportMonth[];
  paymentMethods: readonly DuesFinanceReportPaymentMethod[];
  members: readonly DuesFinanceReportMember[];
  advances: readonly DuesFinanceReportAdvance[];
}>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
const monthPattern = /^\d{4}-\d{2}$/u;
const paymentMethods = new Set<DuesFinancePaymentMethod>(["cash", "bank_transfer", "check", "other"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uuid(value: unknown) {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw new Error("invalid_dues_finance_report");
  return value.toLowerCase();
}

function text(value: unknown, maximum: number, minimum = 1) {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum) {
    throw new Error("invalid_dues_finance_report");
  }
  return value;
}

function integer(value: unknown, minimum = 0, maximum = 9_999_999_999) {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^-?\d+(?:\.0+)?$/u.test(value.trim())
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error("invalid_dues_finance_report");
  }
  return parsed;
}

function date(value: unknown) {
  const parsed = text(value, 10, 10);
  if (!datePattern.test(parsed)) throw new Error("invalid_dues_finance_report");
  const dateValue = new Date(`${parsed}T00:00:00Z`);
  if (Number.isNaN(dateValue.getTime()) || dateValue.toISOString().slice(0, 10) !== parsed) {
    throw new Error("invalid_dues_finance_report");
  }
  return parsed;
}

function month(value: unknown) {
  const parsed = text(value, 7, 7);
  if (!monthPattern.test(parsed)) throw new Error("invalid_dues_finance_report");
  const dateValue = new Date(`${parsed}-01T00:00:00Z`);
  if (Number.isNaN(dateValue.getTime()) || dateValue.toISOString().slice(0, 7) !== parsed) {
    throw new Error("invalid_dues_finance_report");
  }
  return parsed;
}

function sum<T>(values: readonly T[], select: (value: T) => number) {
  return values.reduce((total, value) => total + select(value), 0);
}

function parseSummary(value: unknown): DuesFinanceReportSummary {
  if (!isRecord(value)) throw new Error("invalid_dues_finance_report");
  const result = {
    memberCount: integer(value.member_count),
    receivableCount: integer(value.receivable_count),
    receivableAmount: integer(value.receivable_amount),
    receivedAmount: integer(value.received_amount),
    outstandingAmount: integer(value.outstanding_amount),
    unpaidCount: integer(value.unpaid_count),
    partialCount: integer(value.partial_count),
    paidCount: integer(value.paid_count),
    receiptCount: integer(value.receipt_count),
    receivedByMethodAmount: integer(value.received_by_method_amount),
    advanceCount: integer(value.advance_count),
    advanceAmount: integer(value.advance_amount),
    reconciledAmount: integer(value.reconciled_amount),
    advanceOutstandingAmount: integer(value.advance_outstanding_amount),
  };
  if (result.receivedAmount + result.outstandingAmount !== result.receivableAmount
    || result.reconciledAmount + result.advanceOutstandingAmount !== result.advanceAmount
    || result.unpaidCount + result.partialCount + result.paidCount !== result.receivableCount
    || result.receivedByMethodAmount !== result.receivedAmount) {
    throw new Error("inconsistent_dues_finance_report");
  }
  return result;
}

function parseMonth(value: unknown): DuesFinanceReportMonth {
  if (!isRecord(value)) throw new Error("invalid_dues_finance_report");
  return {
    month: month(value.month),
    receiptCount: integer(value.receipt_count),
    receivedAmount: integer(value.received_amount),
  };
}

function parsePaymentMethod(value: unknown): DuesFinanceReportPaymentMethod {
  if (!isRecord(value) || typeof value.payment_method !== "string" || !paymentMethods.has(value.payment_method as DuesFinancePaymentMethod)) {
    throw new Error("invalid_dues_finance_report");
  }
  return {
    paymentMethod: value.payment_method as DuesFinancePaymentMethod,
    receiptCount: integer(value.receipt_count),
    receivedAmount: integer(value.received_amount),
  };
}

function parseMember(value: unknown): DuesFinanceReportMember {
  if (!isRecord(value)) throw new Error("invalid_dues_finance_report");
  const result = {
    memberDisplayName: text(value.member_display_name, 300),
    receivableCount: integer(value.receivable_count),
    receivableAmount: integer(value.receivable_amount),
    receivedAmount: integer(value.received_amount),
    outstandingAmount: integer(value.outstanding_amount),
    unpaidCount: integer(value.unpaid_count),
    partialCount: integer(value.partial_count),
    paidCount: integer(value.paid_count),
  };
  if (result.receivedAmount + result.outstandingAmount !== result.receivableAmount
    || result.unpaidCount + result.partialCount + result.paidCount !== result.receivableCount) {
    throw new Error("inconsistent_dues_finance_report");
  }
  return result;
}

function parseAdvance(value: unknown): DuesFinanceReportAdvance {
  if (!isRecord(value) || typeof value.advance_status !== "string"
    || value.advance_status !== "submitted" && value.advance_status !== "returned" && value.advance_status !== "closed") {
    throw new Error("invalid_dues_finance_report");
  }
  const result = {
    memberDisplayName: text(value.member_display_name, 300),
    amount: integer(value.amount, 1),
    reconciledAmount: integer(value.reconciled_amount),
    outstandingAmount: integer(value.outstanding_amount),
    advanceStatus: value.advance_status as "submitted" | "returned" | "closed",
  };
  if (result.reconciledAmount + result.outstandingAmount !== result.amount) {
    throw new Error("inconsistent_dues_finance_report");
  }
  return result;
}

function expectedMonth(year: number, index: number) {
  return new Date(Date.UTC(year, 6 + index, 1)).toISOString().slice(0, 7);
}

export function parseDuesFinanceReport(value: unknown): DuesFinanceReport {
  if (!isRecord(value)
    || typeof value.club_id !== "string"
    || typeof value.rotary_year_id !== "string"
    || typeof value.rotary_year_label !== "string"
    || typeof value.currency_code !== "string"
    || value.currency_code !== "TWD"
    || !Array.isArray(value.months)
    || !Array.isArray(value.payment_methods)
    || !Array.isArray(value.members)
    || !Array.isArray(value.advances)) {
    throw new Error("invalid_dues_finance_report");
  }
  const rotaryYearStart = integer(value.rotary_year_start, 2000, 9998);
  const rotaryYearLabel = text(value.rotary_year_label, 32);
  const startsOn = date(value.starts_on);
  const endsOn = date(value.ends_on);
  if (rotaryYearLabel !== `${rotaryYearStart}-${String(rotaryYearStart + 1).slice(-2)}`
    || startsOn !== `${rotaryYearStart}-07-01`
    || endsOn !== `${rotaryYearStart + 1}-06-30`
    || value.months.length !== 12
    || value.payment_methods.length > 4
    || value.members.length > 5000
    || value.advances.length > 5000) {
    throw new Error("invalid_dues_finance_report");
  }
  const summary = parseSummary(value.summary);
  const months = value.months.map(parseMonth);
  const paymentMethodsReport = value.payment_methods.map(parsePaymentMethod);
  const members = value.members.map(parseMember);
  const advances = value.advances.map(parseAdvance);
  if (months.some((entry, index) => entry.month !== expectedMonth(rotaryYearStart, index))
    || new Set(paymentMethodsReport.map((entry) => entry.paymentMethod)).size !== paymentMethodsReport.length
    || summary.receiptCount !== sum(paymentMethodsReport, (entry) => entry.receiptCount)
    || summary.receivedAmount !== sum(paymentMethodsReport, (entry) => entry.receivedAmount)
    || summary.receiptCount !== sum(months, (entry) => entry.receiptCount)
    || summary.receivedAmount !== sum(months, (entry) => entry.receivedAmount)
    || summary.memberCount !== members.length
    || summary.receivableCount !== sum(members, (entry) => entry.receivableCount)
    || summary.receivableAmount !== sum(members, (entry) => entry.receivableAmount)
    || summary.receivedAmount !== sum(members, (entry) => entry.receivedAmount)
    || summary.outstandingAmount !== sum(members, (entry) => entry.outstandingAmount)
    || summary.unpaidCount !== sum(members, (entry) => entry.unpaidCount)
    || summary.partialCount !== sum(members, (entry) => entry.partialCount)
    || summary.paidCount !== sum(members, (entry) => entry.paidCount)
    || summary.advanceCount !== advances.length
    || summary.advanceAmount !== sum(advances, (entry) => entry.amount)
    || summary.reconciledAmount !== sum(advances, (entry) => entry.reconciledAmount)
    || summary.advanceOutstandingAmount !== sum(advances, (entry) => entry.outstandingAmount)) {
    throw new Error("inconsistent_dues_finance_report");
  }
  return {
    clubId: uuid(value.club_id),
    rotaryYearId: uuid(value.rotary_year_id),
    rotaryYearStart,
    rotaryYearLabel,
    startsOn,
    endsOn,
    currencyCode: "TWD",
    summary,
    months,
    paymentMethods: paymentMethodsReport,
    members,
    advances,
  };
}

import type { DuesFinanceReport } from "./reporting-contracts";

const dangerousSpreadsheetPrefix = /^[=+\-@]/u;

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "\"\"";
  const text = String(value);
  const safeText = dangerousSpreadsheetPrefix.test(text) ? `'${text}` : text;
  return `\"${safeText.replaceAll('\"', '\"\"')}\"`;
}

function csvRow(values: readonly unknown[]) {
  return values.map(csvCell).join(",");
}

function monthLabel(value: string) {
  const [year, month] = value.split("-");
  return `${year} 年 ${Number(month)} 月`;
}

function paymentMethodLabel(value: string) {
  return ({ cash: "現金", bank_transfer: "轉帳", check: "支票", other: "其他" } as Record<string, string>)[value] ?? value;
}

export function serializeDuesFinanceReportCsv(report: DuesFinanceReport) {
  const rows: unknown[][] = [
    ["社費、收款與核銷扶輪年度報表"],
    ["扶輪年度", report.rotaryYearLabel],
    ["期間", `${report.startsOn}～${report.endsOn}`],
    [],
    ["年度摘要"],
    ["項目", "數值"],
    ["應收總額", report.summary.receivableAmount],
    ["已收總額", report.summary.receivedAmount],
    ["尚未收款", report.summary.outstandingAmount],
    ["應收筆數", report.summary.receivableCount],
    ["社員人數", report.summary.memberCount],
    ["未收筆數", report.summary.unpaidCount],
    ["部分收款筆數", report.summary.partialCount],
    ["已收清筆數", report.summary.paidCount],
    ["收款筆數", report.summary.receiptCount],
    ["代墊總額", report.summary.advanceAmount],
    ["已核銷代墊", report.summary.reconciledAmount],
    ["待核銷代墊", report.summary.advanceOutstandingAmount],
    [],
    ["每月收款統計"],
    ["月份", "收款筆數", "已收"],
    ...report.months.map((entry) => [monthLabel(entry.month), entry.receiptCount, entry.receivedAmount]),
    [],
    ["收款方式統計"],
    ["方式", "收款筆數", "已收"],
    ...report.paymentMethods.map((entry) => [paymentMethodLabel(entry.paymentMethod), entry.receiptCount, entry.receivedAmount]),
    [],
    ["社員應收彙總"],
    ["社員", "應收筆數", "應收", "已收", "未收", "未收筆數", "部分收款筆數", "已收清筆數"],
    ...report.members.map((entry) => [
      entry.memberDisplayName,
      entry.receivableCount,
      entry.receivableAmount,
      entry.receivedAmount,
      entry.outstandingAmount,
      entry.unpaidCount,
      entry.partialCount,
      entry.paidCount,
    ]),
    [],
    ["代墊彙總"],
    ["社員", "代墊", "已核銷", "待核銷", "狀態"],
    ...report.advances.map((entry) => [
      entry.memberDisplayName,
      entry.amount,
      entry.reconciledAmount,
      entry.outstandingAmount,
      ({ submitted: "待審核", returned: "退回", closed: "已結案" } as Record<string, string>)[entry.advanceStatus] ?? entry.advanceStatus,
    ]),
  ];
  return `\uFEFF${rows.map(csvRow).join("\r\n")}\r\n`;
}

function safeFilenamePart(value: string) {
  return value.replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/^\.+/u, "").slice(0, 80) || "club";
}

export function duesFinanceReportFilename(report: Pick<DuesFinanceReport, "rotaryYearLabel">, extension: "csv" | "xlsx" | "pdf") {
  return `dues-finance-${safeFilenamePart(report.rotaryYearLabel)}.${extension}`;
}

export function duesFinancePaymentMethodLabel(value: string) {
  return paymentMethodLabel(value);
}

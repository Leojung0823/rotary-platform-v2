import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import type { DuesFinanceReport } from "./reporting-contracts";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_HEIGHT = 22;
const BOTTOM = PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT;
const FONT_PATH = join(process.cwd(), "public", "fonts", "NotoSansTC-Regular.woff");

type PdfDocument = InstanceType<typeof PDFDocument>;
type Column = Readonly<{ label: string; width: number; align?: "left" | "right" | "center" }>;
type RenderState = { page: number; y: number };

function money(value: number) {
  return `NT$${value.toLocaleString("zh-TW")}`;
}

function monthLabel(value: string) {
  const [year, month] = value.split("-");
  return `${year} 年 ${Number(month)} 月`;
}

function paymentMethodLabel(value: string) {
  return ({ cash: "現金", bank_transfer: "轉帳", check: "支票", other: "其他" } as Record<string, string>)[value] ?? value;
}

function advanceStatusLabel(value: string) {
  return ({ submitted: "待審核", returned: "退回", closed: "已結案" } as Record<string, string>)[value] ?? value;
}

function fontData() {
  return readFileSync(FONT_PATH);
}

function drawHeader(doc: PdfDocument, state: RenderState, report: DuesFinanceReport, font: Buffer) {
  doc.font(font).fontSize(16).fillColor("#0f172a").text(
    "社費、收款與核銷扶輪年度報表",
    MARGIN,
    MARGIN,
    { width: CONTENT_WIDTH, lineBreak: false },
  );
  doc.fontSize(9).fillColor("#475569").text(
    `${report.rotaryYearLabel} 年度 (${report.startsOn} ~ ${report.endsOn})`,
    MARGIN,
    MARGIN + 27,
    { width: CONTENT_WIDTH, lineBreak: false, ellipsis: true },
  );
  doc.strokeColor("#cbd5e1").lineWidth(0.7)
    .moveTo(MARGIN, MARGIN + 46)
    .lineTo(MARGIN + CONTENT_WIDTH, MARGIN + 46)
    .stroke();
  state.y = MARGIN + 62;
}

function drawFooter(doc: PdfDocument, state: RenderState) {
  doc.fontSize(8).fillColor("#64748b").text(
    `Rotary Platform · 第 ${state.page} 頁`,
    MARGIN,
    PAGE_HEIGHT - MARGIN - 15,
    { width: CONTENT_WIDTH, align: "right", lineBreak: false },
  );
}

function beginPage(doc: PdfDocument, state: RenderState, report: DuesFinanceReport, font: Buffer) {
  if (state.page > 0) doc.addPage({ size: "A4", margin: MARGIN });
  state.page += 1;
  drawHeader(doc, state, report, font);
}

function ensureSpace(doc: PdfDocument, state: RenderState, report: DuesFinanceReport, font: Buffer, required: number) {
  if (state.y + required <= BOTTOM) return;
  drawFooter(doc, state);
  beginPage(doc, state, report, font);
}

function drawSectionHeading(doc: PdfDocument, state: RenderState, report: DuesFinanceReport, font: Buffer, title: string) {
  ensureSpace(doc, state, report, font, 34 + 26 + 24);
  doc.fontSize(12).fillColor("#0f172a").text(title, MARGIN, state.y, { width: CONTENT_WIDTH, lineBreak: false });
  state.y += 24;
}

function drawTableHeader(doc: PdfDocument, state: RenderState, columns: readonly Column[]) {
  const height = 26;
  doc.save().fillColor("#e2e8f0").rect(MARGIN, state.y, CONTENT_WIDTH, height).fill().restore();
  let x = MARGIN;
  for (const column of columns) {
    doc.fontSize(8.5).fillColor("#334155").text(column.label, x + 5, state.y + 8, {
      width: column.width - 10,
      align: column.align ?? "left",
      lineBreak: false,
      ellipsis: true,
    });
    x += column.width;
  }
  doc.strokeColor("#cbd5e1").lineWidth(0.6)
    .moveTo(MARGIN, state.y + height)
    .lineTo(MARGIN + CONTENT_WIDTH, state.y + height)
    .stroke();
  state.y += height;
}

function drawTableRow(doc: PdfDocument, state: RenderState, columns: readonly Column[], values: readonly string[], index: number) {
  const height = 24;
  if (index % 2 === 1) doc.save().fillColor("#f8fafc").rect(MARGIN, state.y, CONTENT_WIDTH, height).fill().restore();
  let x = MARGIN;
  for (const [valueIndex, column] of columns.entries()) {
    doc.fontSize(8.5).fillColor("#1e293b").text(values[valueIndex] ?? "", x + 5, state.y + 7, {
      width: column.width - 10,
      align: column.align ?? "left",
      lineBreak: false,
      ellipsis: true,
    });
    x += column.width;
  }
  doc.strokeColor("#e2e8f0").lineWidth(0.5)
    .moveTo(MARGIN, state.y + height)
    .lineTo(MARGIN + CONTENT_WIDTH, state.y + height)
    .stroke();
  state.y += height;
}

function drawTable(
  doc: PdfDocument,
  state: RenderState,
  report: DuesFinanceReport,
  font: Buffer,
  columns: readonly Column[],
  rows: readonly (readonly string[])[],
) {
  const rowHeight = 24;
  ensureSpace(doc, state, report, font, 26 + rowHeight);
  drawTableHeader(doc, state, columns);
  rows.forEach((row, index) => {
    if (state.y + rowHeight > BOTTOM) {
      drawFooter(doc, state);
      beginPage(doc, state, report, font);
      drawTableHeader(doc, state, columns);
    }
    drawTableRow(doc, state, columns, row, index);
  });
  state.y += 12;
}

function writeReport(doc: PdfDocument, report: DuesFinanceReport, font: Buffer) {
  const state: RenderState = { page: 0, y: 0 };
  beginPage(doc, state, report, font);
  drawSectionHeading(doc, state, report, font, "年度摘要");
  drawTable(doc, state, report, font, [
    { label: "項目", width: 250 },
    { label: "數值", width: CONTENT_WIDTH - 250, align: "right" },
  ], [
    ["應收總額", money(report.summary.receivableAmount)],
    ["已收總額", money(report.summary.receivedAmount)],
    ["尚未收款", money(report.summary.outstandingAmount)],
    ["應收／社員", `${report.summary.receivableCount.toLocaleString("zh-TW")} / ${report.summary.memberCount.toLocaleString("zh-TW")}`],
    ["未收／部分／已收清", `${report.summary.unpaidCount} / ${report.summary.partialCount} / ${report.summary.paidCount}`],
    ["代墊總額", money(report.summary.advanceAmount)],
    ["已核銷代墊", money(report.summary.reconciledAmount)],
    ["待核銷代墊", money(report.summary.advanceOutstandingAmount)],
  ]);

  drawSectionHeading(doc, state, report, font, "每月收款統計");
  drawTable(doc, state, report, font, [
    { label: "月份", width: 180 },
    { label: "收款筆數", width: 120, align: "right" },
    { label: "已收", width: CONTENT_WIDTH - 300, align: "right" },
  ], report.months.map((entry) => [
    monthLabel(entry.month),
    entry.receiptCount.toLocaleString("zh-TW"),
    money(entry.receivedAmount),
  ]));

  drawSectionHeading(doc, state, report, font, "收款方式統計");
  drawTable(doc, state, report, font, [
    { label: "方式", width: 180 },
    { label: "收款筆數", width: 120, align: "right" },
    { label: "已收", width: CONTENT_WIDTH - 300, align: "right" },
  ], report.paymentMethods.map((entry) => [
    paymentMethodLabel(entry.paymentMethod),
    entry.receiptCount.toLocaleString("zh-TW"),
    money(entry.receivedAmount),
  ]));

  drawSectionHeading(doc, state, report, font, "社員應收彙總");
  drawTable(doc, state, report, font, [
    { label: "社員", width: 130 },
    { label: "應收", width: 72, align: "right" },
    { label: "已收", width: 78, align: "right" },
    { label: "未收", width: 78, align: "right" },
    { label: "筆數", width: 48, align: "right" },
    { label: "未／部／清", width: CONTENT_WIDTH - 406, align: "right" },
  ], report.members.map((entry) => [
    entry.memberDisplayName,
    money(entry.receivableAmount),
    money(entry.receivedAmount),
    money(entry.outstandingAmount),
    entry.receivableCount.toLocaleString("zh-TW"),
    `${entry.unpaidCount}/${entry.partialCount}/${entry.paidCount}`,
  ]));

  drawSectionHeading(doc, state, report, font, "代墊彙總");
  drawTable(doc, state, report, font, [
    { label: "社員", width: 150 },
    { label: "代墊", width: 90, align: "right" },
    { label: "已核銷", width: 90, align: "right" },
    { label: "待核銷", width: 90, align: "right" },
    { label: "狀態", width: CONTENT_WIDTH - 420 },
  ], report.advances.map((entry) => [
    entry.memberDisplayName,
    money(entry.amount),
    money(entry.reconciledAmount),
    money(entry.outstandingAmount),
    advanceStatusLabel(entry.advanceStatus),
  ]));

  drawFooter(doc, state);
}

export function renderDuesFinanceReportPdf(report: DuesFinanceReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: MARGIN });
    doc.on("data", (chunk: Buffer | Uint8Array) => chunks.push(Buffer.from(chunk)));
    doc.once("error", reject);
    doc.once("end", () => resolve(Buffer.concat(chunks)));
    try {
      writeReport(doc, report, fontData());
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

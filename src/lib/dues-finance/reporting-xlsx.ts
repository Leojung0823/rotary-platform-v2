import ExcelJS from "exceljs";
import type { DuesFinanceReport } from "./reporting-contracts";
import { duesFinancePaymentMethodLabel } from "./reporting-export";

function advanceStatusLabel(value: string) {
  return ({ submitted: "待審核", returned: "退回", closed: "已結案" } as Record<string, string>)[value] ?? value;
}

export async function renderDuesFinanceReportXlsx(report: DuesFinanceReport) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Rotary Platform";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("年度摘要");
  summary.columns = [
    { header: "項目", key: "label", width: 26 },
    { header: "數值", key: "value", width: 24 },
  ];
  summary.addRows([
    ["社費、收款與核銷扶輪年度報表", ""],
    ["扶輪年度", report.rotaryYearLabel],
    ["期間", `${report.startsOn}～${report.endsOn}`],
    ["應收總額", report.summary.receivableAmount],
    ["已收總額", report.summary.receivedAmount],
    ["尚未收款", report.summary.outstandingAmount],
    ["應收筆數", report.summary.receivableCount],
    ["社員人數", report.summary.memberCount],
    ["未收／部分／已收清", `${report.summary.unpaidCount} / ${report.summary.partialCount} / ${report.summary.paidCount}`],
    ["收款筆數", report.summary.receiptCount],
    ["代墊總額", report.summary.advanceAmount],
    ["已核銷代墊", report.summary.reconciledAmount],
    ["待核銷代墊", report.summary.advanceOutstandingAmount],
  ]);
  summary.getRow(1).font = { bold: true, size: 14 };
  summary.getColumn(2).numFmt = "#,##0";
  summary.views = [{ state: "frozen", ySplit: 1 }];

  const months = workbook.addWorksheet("每月收款");
  months.columns = [
    { header: "月份", key: "month", width: 18 },
    { header: "收款筆數", key: "count", width: 14 },
    { header: "已收", key: "amount", width: 18 },
  ];
  months.addRows(report.months.map((entry) => ({ month: entry.month, count: entry.receiptCount, amount: entry.receivedAmount })));
  months.getRow(1).font = { bold: true };
  months.getColumn(3).numFmt = "#,##0";
  months.autoFilter = { from: "A1", to: "C1" };
  months.views = [{ state: "frozen", ySplit: 1 }];

  const paymentMethods = workbook.addWorksheet("收款方式");
  paymentMethods.columns = [
    { header: "方式", key: "method", width: 18 },
    { header: "收款筆數", key: "count", width: 14 },
    { header: "已收", key: "amount", width: 18 },
  ];
  paymentMethods.addRows(report.paymentMethods.map((entry) => ({
    method: duesFinancePaymentMethodLabel(entry.paymentMethod),
    count: entry.receiptCount,
    amount: entry.receivedAmount,
  })));
  paymentMethods.getRow(1).font = { bold: true };
  paymentMethods.getColumn(3).numFmt = "#,##0";
  paymentMethods.autoFilter = { from: "A1", to: "C1" };
  paymentMethods.views = [{ state: "frozen", ySplit: 1 }];

  const members = workbook.addWorksheet("社員應收");
  members.columns = [
    { header: "社員", key: "name", width: 24 },
    { header: "應收筆數", key: "count", width: 14 },
    { header: "應收", key: "receivable", width: 16 },
    { header: "已收", key: "received", width: 16 },
    { header: "未收", key: "outstanding", width: 16 },
    { header: "未收筆數", key: "unpaid", width: 14 },
    { header: "部分收款筆數", key: "partial", width: 18 },
    { header: "已收清筆數", key: "paid", width: 16 },
  ];
  members.addRows(report.members.map((entry) => ({
    name: entry.memberDisplayName,
    count: entry.receivableCount,
    receivable: entry.receivableAmount,
    received: entry.receivedAmount,
    outstanding: entry.outstandingAmount,
    unpaid: entry.unpaidCount,
    partial: entry.partialCount,
    paid: entry.paidCount,
  })));
  members.getRow(1).font = { bold: true };
  for (const column of [3, 4, 5]) members.getColumn(column).numFmt = "#,##0";
  members.autoFilter = { from: "A1", to: "H1" };
  members.views = [{ state: "frozen", ySplit: 1 }];

  const advances = workbook.addWorksheet("代墊彙總");
  advances.columns = [
    { header: "社員", key: "name", width: 24 },
    { header: "代墊", key: "amount", width: 16 },
    { header: "已核銷", key: "reconciled", width: 16 },
    { header: "待核銷", key: "outstanding", width: 16 },
    { header: "狀態", key: "status", width: 14 },
  ];
  advances.addRows(report.advances.map((entry) => ({
    name: entry.memberDisplayName,
    amount: entry.amount,
    reconciled: entry.reconciledAmount,
    outstanding: entry.outstandingAmount,
    status: advanceStatusLabel(entry.advanceStatus),
  })));
  advances.getRow(1).font = { bold: true };
  for (const column of [2, 3, 4]) advances.getColumn(column).numFmt = "#,##0";
  advances.autoFilter = { from: "A1", to: "E1" };
  advances.views = [{ state: "frozen", ySplit: 1 }];

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

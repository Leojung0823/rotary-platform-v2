const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function parseDuesFinanceReportUuid(value: string | null) {
  if (!value || !uuidPattern.test(value.trim())) throw new Error("invalid_dues_finance_report_parameter");
  return value.trim().toLowerCase();
}

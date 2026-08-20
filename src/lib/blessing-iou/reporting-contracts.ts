export type BlessingIouReportSummary = Readonly<{
  entryCount: number;
  memberCount: number;
  pledgedAmount: number;
  receivedAmount: number;
  outstandingAmount: number;
  unpaidEntryCount: number;
  partialEntryCount: number;
  paidEntryCount: number;
}>;

export type BlessingIouReportMonth = Readonly<{
  month: string;
  entryCount: number;
  memberCount: number;
  pledgedAmount: number;
  receivedAmount: number;
  outstandingAmount: number;
}>;

export type BlessingIouReportMember = Readonly<{
  authorMembershipId: string;
  authorDisplayName: string;
  entryCount: number;
  pledgedAmount: number;
  receivedAmount: number;
  outstandingAmount: number;
  unpaidEntryCount: number;
  partialEntryCount: number;
  paidEntryCount: number;
}>;

export type BlessingIouRotaryYearReport = Readonly<{
  clubId: string;
  clubCode: string;
  clubName: string;
  rotaryYearStart: number;
  rotaryYearLabel: string;
  startsOn: string;
  endsOn: string;
  currencyCode: "TWD";
  summary: BlessingIouReportSummary;
  months: readonly BlessingIouReportMonth[];
  members: readonly BlessingIouReportMember[];
}>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
const monthPattern = /^\d{4}-\d{2}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isText(value: unknown, maximum: number) {
  return typeof value === "string" && value.length >= 1 && Array.from(value).length <= maximum;
}

function moneyIsConsistent(value: Record<string, unknown>) {
  return isInteger(value.pledged_amount)
    && isInteger(value.received_amount)
    && isInteger(value.outstanding_amount)
    && value.received_amount + value.outstanding_amount === value.pledged_amount;
}

function parseStatusCounts(value: Record<string, unknown>) {
  if (!isInteger(value.entry_count)
    || !isInteger(value.unpaid_entry_count)
    || !isInteger(value.partial_entry_count)
    || !isInteger(value.paid_entry_count)
    || value.unpaid_entry_count + value.partial_entry_count + value.paid_entry_count !== value.entry_count) {
    throw new Error("invalid_blessing_iou_report_counts");
  }
  return {
    entryCount: value.entry_count,
    unpaidEntryCount: value.unpaid_entry_count,
    partialEntryCount: value.partial_entry_count,
    paidEntryCount: value.paid_entry_count,
  };
}

function parseSummary(value: unknown): BlessingIouReportSummary {
  if (!isRecord(value) || !isInteger(value.member_count) || !moneyIsConsistent(value)) {
    throw new Error("invalid_blessing_iou_report_summary");
  }
  return {
    ...parseStatusCounts(value),
    memberCount: value.member_count,
    pledgedAmount: value.pledged_amount as number,
    receivedAmount: value.received_amount as number,
    outstandingAmount: value.outstanding_amount as number,
  };
}

function parseMonth(value: unknown): BlessingIouReportMonth {
  if (!isRecord(value)
    || typeof value.month !== "string"
    || !monthPattern.test(value.month)
    || !isInteger(value.entry_count)
    || !isInteger(value.member_count)
    || value.member_count > value.entry_count
    || !moneyIsConsistent(value)) {
    throw new Error("invalid_blessing_iou_report_month");
  }
  return {
    month: value.month,
    entryCount: value.entry_count,
    memberCount: value.member_count,
    pledgedAmount: value.pledged_amount as number,
    receivedAmount: value.received_amount as number,
    outstandingAmount: value.outstanding_amount as number,
  };
}

function parseMember(value: unknown): BlessingIouReportMember {
  if (!isRecord(value)
    || typeof value.author_membership_id !== "string"
    || !uuidPattern.test(value.author_membership_id)
    || !isText(value.author_display_name, 300)
    || !moneyIsConsistent(value)) {
    throw new Error("invalid_blessing_iou_report_member");
  }
  return {
    authorMembershipId: value.author_membership_id,
    authorDisplayName: value.author_display_name as string,
    ...parseStatusCounts(value),
    pledgedAmount: value.pledged_amount as number,
    receivedAmount: value.received_amount as number,
    outstandingAmount: value.outstanding_amount as number,
  };
}

function expectedMonth(rotaryYearStart: number, index: number) {
  return new Date(Date.UTC(rotaryYearStart, 6 + index, 1)).toISOString().slice(0, 7);
}

function sum<T>(values: readonly T[], select: (value: T) => number) {
  return values.reduce((total, value) => total + select(value), 0);
}

export function parseBlessingIouRotaryYearReport(value: unknown): BlessingIouRotaryYearReport {
  if (!isRecord(value)
    || typeof value.club_id !== "string"
    || !uuidPattern.test(value.club_id)
    || !isText(value.club_code, 100)
    || !isText(value.club_name, 300)
    || !isInteger(value.rotary_year_start)
    || value.rotary_year_start < 2000
    || value.rotary_year_start > 9998
    || typeof value.rotary_year_label !== "string"
    || typeof value.starts_on !== "string"
    || !datePattern.test(value.starts_on)
    || typeof value.ends_on !== "string"
    || !datePattern.test(value.ends_on)
    || value.currency_code !== "TWD"
    || !Array.isArray(value.months)
    || value.months.length !== 12
    || !Array.isArray(value.members)
    || value.members.length > 5000) {
    throw new Error("invalid_blessing_iou_rotary_year_report");
  }
  const year = value.rotary_year_start;
  if (value.rotary_year_label !== `${year}-${String(year + 1).slice(-2)}`
    || value.starts_on !== `${year}-07-01`
    || value.ends_on !== `${year + 1}-06-30`) {
    throw new Error("invalid_blessing_iou_rotary_year_report");
  }
  const summary = parseSummary(value.summary);
  const months = value.months.map(parseMonth);
  const members = value.members.map(parseMember);
  if (months.some((month, index) => month.month !== expectedMonth(year, index))
    || new Set(members.map((member) => member.authorMembershipId)).size !== members.length
    || summary.memberCount !== members.length
    || summary.entryCount !== sum(months, (month) => month.entryCount)
    || summary.pledgedAmount !== sum(months, (month) => month.pledgedAmount)
    || summary.receivedAmount !== sum(months, (month) => month.receivedAmount)
    || summary.outstandingAmount !== sum(months, (month) => month.outstandingAmount)
    || summary.entryCount !== sum(members, (member) => member.entryCount)
    || summary.pledgedAmount !== sum(members, (member) => member.pledgedAmount)
    || summary.receivedAmount !== sum(members, (member) => member.receivedAmount)
    || summary.outstandingAmount !== sum(members, (member) => member.outstandingAmount)
    || summary.unpaidEntryCount !== sum(members, (member) => member.unpaidEntryCount)
    || summary.partialEntryCount !== sum(members, (member) => member.partialEntryCount)
    || summary.paidEntryCount !== sum(members, (member) => member.paidEntryCount)) {
    throw new Error("inconsistent_blessing_iou_rotary_year_report");
  }
  return {
    clubId: value.club_id,
    clubCode: value.club_code as string,
    clubName: value.club_name as string,
    rotaryYearStart: year,
    rotaryYearLabel: value.rotary_year_label,
    startsOn: value.starts_on,
    endsOn: value.ends_on,
    currencyCode: "TWD",
    summary,
    months,
    members,
  };
}

/**
 * Who an event's invitation reached, and what each of them said.
 *
 * "no_reply" is a state of the roster, not of the database: a member who has
 * never opened the event has no registration row at all. It is kept distinct
 * from "pending" because they are different facts -- pending means they opened
 * it and did not decide; no_reply means nobody has heard from them.
 */
export const registrationResponses = ["attending", "pending", "no_reply", "declined"] as const;
export type RegistrationResponse = (typeof registrationResponses)[number];

export const registrationResponseLabels: Record<RegistrationResponse, string> = {
  attending: "參加",
  pending: "待確認",
  no_reply: "未回覆",
  declined: "不參加",
};

export type RegistrationRosterEntry = Readonly<{
  membershipId: string;
  displayName: string;
  response: RegistrationResponse;
  guestCount: number;
  note: string;
  respondedAt: string | null;
}>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const maximumMembers = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validated rather than trusted: an unparseable roster is not an empty one. */
export function parseRegistrationRoster(value: unknown): readonly RegistrationRosterEntry[] | null {
  if (!isRecord(value) || !Array.isArray(value.members) || value.members.length > maximumMembers) return null;

  const entries: RegistrationRosterEntry[] = [];
  for (const row of value.members) {
    if (!isRecord(row)) return null;
    if (typeof row.membership_id !== "string" || !uuidPattern.test(row.membership_id)) return null;
    if (typeof row.display_name !== "string" || row.display_name.length === 0 || row.display_name.length > 200) return null;
    if (typeof row.response !== "string"
      || !(registrationResponses as readonly string[]).includes(row.response)) return null;
    if (typeof row.guest_count !== "number" || !Number.isInteger(row.guest_count)
      || row.guest_count < 0 || row.guest_count > 20) return null;
    if (typeof row.note !== "string" || row.note.length > 500) return null;
    if (!(row.responded_at === null || typeof row.responded_at === "string")) return null;
    entries.push({
      membershipId: row.membership_id,
      displayName: row.display_name,
      response: row.response as RegistrationResponse,
      guestCount: row.guest_count,
      note: row.note,
      respondedAt: (row.responded_at as string | null) ?? null,
    });
  }
  return entries;
}

/** The counts the card shows above the list. */
export function rosterSummary(entries: readonly RegistrationRosterEntry[]) {
  const attending = entries.filter((entry) => entry.response === "attending");
  return {
    attending: attending.length,
    // A member brings guests; the spots used counts both.
    spots: attending.reduce((total, entry) => total + 1 + entry.guestCount, 0),
    awaiting: entries.filter((entry) => entry.response === "no_reply" || entry.response === "pending").length,
    declined: entries.filter((entry) => entry.response === "declined").length,
  };
}

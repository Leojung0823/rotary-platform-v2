/**
 * The shape search_my_club emits, validated rather than trusted.
 *
 * The page distinguishes "nothing matched" from "something went wrong", so a
 * payload that does not parse must not arrive as an empty result: a member who
 * searched for a colleague and was told "not found" would have no way to know
 * the search never ran.
 */
export type ClubSearchEvent = Readonly<{
  id: string;
  title: string;
  location: string;
  startsAt: string;
}>;

export type ClubSearchMember = Readonly<{
  membershipId: string;
  displayName: string;
  occupation: string;
}>;

export type ClubSearchMessage = Readonly<{
  id: string;
  title: string;
  publishedAt: string;
  unread: boolean;
}>;

export type ClubSearchResults = Readonly<{
  query: string;
  events: readonly ClubSearchEvent[];
  members: readonly ClubSearchMember[];
  messages: readonly ClubSearchMessage[];
}>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const maximumRows = 20;
const maximumText = 400;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown): string | null {
  return typeof value === "string" && value.length <= maximumText ? value : null;
}

function isoDateTime(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/u.test(value)
    && !Number.isNaN(Date.parse(value));
}

function parseRows<T>(value: unknown, parse: (row: Record<string, unknown>) => T | null): readonly T[] | null {
  if (!Array.isArray(value) || value.length > maximumRows) return null;
  const rows: T[] = [];
  for (const row of value) {
    if (!isRecord(row)) return null;
    const parsed = parse(row);
    if (parsed === null) return null;
    rows.push(parsed);
  }
  return rows;
}

export function parseClubSearchResults(value: unknown): ClubSearchResults | null {
  if (!isRecord(value)) return null;
  const query = boundedText(value.query);
  if (query === null) return null;

  const events = parseRows<ClubSearchEvent>(value.events, (row) => {
    const title = boundedText(row.title);
    if (typeof row.id !== "string" || !uuidPattern.test(row.id)) return null;
    if (title === null || title.length === 0) return null;
    if (!isoDateTime(row.starts_at)) return null;
    const location = row.location === null ? "" : boundedText(row.location);
    return location === null ? null : { id: row.id, title, location, startsAt: row.starts_at };
  });

  const members = parseRows<ClubSearchMember>(value.members, (row) => {
    const displayName = boundedText(row.display_name);
    if (typeof row.membership_id !== "string" || !uuidPattern.test(row.membership_id)) return null;
    if (displayName === null || displayName.length === 0) return null;
    const occupation = row.occupation === null ? "" : boundedText(row.occupation);
    return occupation === null
      ? null
      : { membershipId: row.membership_id, displayName, occupation };
  });

  const messages = parseRows<ClubSearchMessage>(value.messages, (row) => {
    const title = boundedText(row.title);
    if (typeof row.id !== "string" || !uuidPattern.test(row.id)) return null;
    if (title === null || title.length === 0) return null;
    if (!isoDateTime(row.published_at)) return null;
    if (typeof row.is_unread !== "boolean") return null;
    return { id: row.id, title, publishedAt: row.published_at, unread: row.is_unread };
  });

  if (events === null || members === null || messages === null) return null;
  return { query, events, members, messages };
}

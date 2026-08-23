export type MyBlessingIouLedgerClub = Readonly<{
  club_id: string;
  club_code: string;
  club_name: string;
}>;

export type MyBlessingIouLedgerEntry = Readonly<{
  entry_id: string;
  blessing_text: string;
  pledged_amount: string | number | null;
  currency_code: string;
  amount_is_public: boolean;
  pledged_on: string;
  collected_amount: string | number;
  outstanding_amount: string | number;
}>;

export type MyBlessingIouLedger = Readonly<{
  clubs: readonly MyBlessingIouLedgerClub[];
  selected_club_id: string | null;
  current_year: number | null;
  selected_year: number | null;
  available_years: readonly number[];
  totals: Readonly<{
    entry_count: number;
    pledged_total: string | number;
    collected_total: string | number;
    outstanding_total: string | number;
  }> | null;
  entries: readonly MyBlessingIouLedgerEntry[];
}>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMoney(value: unknown) {
  return typeof value === "number" || (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)));
}

function parseClub(value: unknown): MyBlessingIouLedgerClub | null {
  if (!isRecord(value)
    || typeof value.club_id !== "string" || !uuidPattern.test(value.club_id)
    || typeof value.club_code !== "string" || value.club_code.length > 64
    || typeof value.club_name !== "string" || value.club_name.length > 300) return null;
  return { club_id: value.club_id, club_code: value.club_code, club_name: value.club_name };
}

function parseEntry(value: unknown): MyBlessingIouLedgerEntry | null {
  if (!isRecord(value)
    || typeof value.entry_id !== "string" || !uuidPattern.test(value.entry_id)
    || typeof value.blessing_text !== "string" || value.blessing_text.length > 1000
    || (value.pledged_amount !== null && !isMoney(value.pledged_amount))
    || typeof value.currency_code !== "string" || value.currency_code.length !== 3
    || typeof value.amount_is_public !== "boolean"
    || typeof value.pledged_on !== "string" || !datePattern.test(value.pledged_on)
    || !isMoney(value.collected_amount) || !isMoney(value.outstanding_amount)) return null;
  return value as unknown as MyBlessingIouLedgerEntry;
}

export function parseRotaryYearFilter(value: unknown): number | null | 0 {
  if (value === "all") return null;
  if (typeof value !== "string" || !/^\d{4}$/u.test(value)) return 0;
  const year = Number(value);
  return year >= 1900 && year <= 2200 ? year : 0;
}

export function parseMyBlessingIouLedger(value: unknown): MyBlessingIouLedger | null {
  if (!isRecord(value) || !Array.isArray(value.clubs) || value.clubs.length > 50
    || !Array.isArray(value.available_years) || value.available_years.length > 30
    || !Array.isArray(value.entries) || value.entries.length > 500) return null;

  const clubs = value.clubs.map(parseClub);
  const entries = value.entries.map(parseEntry);
  if (clubs.some((club) => club === null) || entries.some((entry) => entry === null)) return null;

  if (value.selected_club_id !== null
    && (typeof value.selected_club_id !== "string" || !uuidPattern.test(value.selected_club_id))) return null;
  if (value.current_year !== null && (!Number.isInteger(value.current_year) || Number(value.current_year) < 1900)) return null;
  if (value.selected_year !== null && (!Number.isInteger(value.selected_year) || Number(value.selected_year) < 1900)) return null;
  if (value.available_years.some((year) => !Number.isInteger(year) || Number(year) < 1900)) return null;

  if (value.totals !== null && (!isRecord(value.totals)
    || !Number.isInteger(value.totals.entry_count)
    || !isMoney(value.totals.pledged_total)
    || !isMoney(value.totals.collected_total)
    || !isMoney(value.totals.outstanding_total))) return null;

  return {
    clubs: clubs as MyBlessingIouLedgerClub[],
    selected_club_id: value.selected_club_id,
    current_year: value.current_year as number | null,
    selected_year: value.selected_year as number | null,
    available_years: value.available_years as number[],
    totals: value.totals as MyBlessingIouLedger["totals"],
    entries: entries as MyBlessingIouLedgerEntry[],
  };
}

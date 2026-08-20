export const archiveCategories = [
  "meeting_minutes",
  "service_photos",
  "grant_documents",
  "reports",
  "finance_summary",
  "decisions",
  "templates_handover",
  "other",
] as const;

export type ArchiveCategory = (typeof archiveCategories)[number];
export type ArchiveConfidentiality = "club_internal" | "officers_only";
export type HandoverStatus = "preparation" | "awaiting_confirmation" | "completed" | "needs_update";
export type ChecklistStatus = "pending" | "ready" | "confirmed" | "needs_update";

export const archiveCategoryLabels: Readonly<Record<ArchiveCategory, string>> = {
  meeting_minutes: "會議紀錄",
  service_photos: "服務活動照片",
  grant_documents: "補助申請資料",
  reports: "成果與報告",
  finance_summary: "財務摘要文件",
  decisions: "公告與重要決策",
  templates_handover: "範本與交接清單",
  other: "其他",
};

export type ArchivePageProjection = Readonly<{
  clubs: readonly Readonly<{ clubId: string; clubCode: string; clubName: string }>[];
  selectedClubId: string | null;
  canManage: boolean;
  years: readonly Readonly<{
    id: string;
    startYear: number;
    theme: string | null;
    presidentName: string | null;
    secretaryName: string | null;
    handoverStatus: HandoverStatus;
  }>[];
  selectedYearId: string | null;
  items: readonly Readonly<{
    id: string;
    category: ArchiveCategory;
    title: string;
    description: string | null;
    folderPath: string;
    tags: readonly string[];
    confidentiality: ArchiveConfidentiality;
    updatedAt: string;
    versions: readonly Readonly<{
      id: string;
      versionNumber: number;
      originalFilename: string;
      fileSizeBytes: number;
      mediaType: string;
      changeSummary: string | null;
      createdAt: string;
    }>[];
  }>[];
  checklist: readonly Readonly<{
    id: string;
    label: string;
    category: ArchiveCategory;
    isRequired: boolean;
    status: ChecklistStatus;
    archiveItemId: string | null;
    notes: string | null;
  }>[];
  confirmations: readonly Readonly<{
    id: string;
    confirmedBy: string;
    confirmationRole: "outgoing" | "incoming";
    confirmedAt: string;
  }>[];
  missingRequiredCategories: readonly ArchiveCategory[];
}>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const categories = new Set<string>(archiveCategories);
const handoverStatuses = new Set<HandoverStatus>(["preparation", "awaiting_confirmation", "completed", "needs_update"]);
const checklistStatuses = new Set<ChecklistStatus>(["pending", "ready", "confirmed", "needs_update"]);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_archive_projection");
  return value as Record<string, unknown>;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("invalid_archive_projection");
  return value;
}

function text(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) throw new Error("invalid_archive_projection");
  return value;
}

function nullableText(value: unknown, maximum: number): string | null {
  return value === null ? null : text(value, maximum);
}

function uuid(value: unknown): string {
  const result = text(value, 36).toLowerCase();
  if (!uuidPattern.test(result)) throw new Error("invalid_archive_projection");
  return result;
}

function integer(value: unknown, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) throw new Error("invalid_archive_projection");
  return Number(value);
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("invalid_archive_projection");
  return value;
}

function date(value: unknown): string {
  const result = text(value, 40);
  if (Number.isNaN(Date.parse(result))) throw new Error("invalid_archive_projection");
  return result;
}

function category(value: unknown): ArchiveCategory {
  const result = text(value, 40);
  if (!categories.has(result)) throw new Error("invalid_archive_projection");
  return result as ArchiveCategory;
}

export function parseArchivePageProjection(value: unknown): ArchivePageProjection {
  const source = record(value);
  const clubs = list(source.clubs).map((entry) => {
    const club = record(entry);
    return { clubId: uuid(club.club_id), clubCode: text(club.club_code, 32), clubName: text(club.club_name, 100) };
  });
  const selectedClubId = source.selected_club_id === null ? null : uuid(source.selected_club_id);
  if (selectedClubId && !clubs.some((club) => club.clubId === selectedClubId)) throw new Error("invalid_archive_projection");

  const years = list(source.years).map((entry) => {
    const year = record(entry);
    const handoverStatus = text(year.handover_status, 32) as HandoverStatus;
    if (!handoverStatuses.has(handoverStatus)) throw new Error("invalid_archive_projection");
    return {
      id: uuid(year.id),
      startYear: integer(year.start_year, 2000, 2200),
      theme: nullableText(year.theme, 160),
      presidentName: nullableText(year.president_name, 160),
      secretaryName: nullableText(year.secretary_name, 160),
      handoverStatus,
    };
  });
  const selectedYearId = source.selected_year_id === null ? null : uuid(source.selected_year_id);
  if (selectedYearId && !years.some((year) => year.id === selectedYearId)) throw new Error("invalid_archive_projection");

  const items = list(source.items).map((entry) => {
    const item = record(entry);
    const confidentiality = text(item.confidentiality, 24) as ArchiveConfidentiality;
    if (confidentiality !== "club_internal" && confidentiality !== "officers_only") throw new Error("invalid_archive_projection");
    return {
      id: uuid(item.id),
      category: category(item.category),
      title: text(item.title, 180),
      description: nullableText(item.description, 2000),
      folderPath: text(item.folder_path, 240),
      tags: list(item.tags).map((tag) => text(tag, 40)),
      confidentiality,
      updatedAt: date(item.updated_at),
      versions: list(item.versions).map((versionEntry) => {
        const version = record(versionEntry);
        return {
          id: uuid(version.id),
          versionNumber: integer(version.version_number, 1, 100000),
          originalFilename: text(version.original_filename, 240),
          fileSizeBytes: integer(version.file_size_bytes, 1, 10485760),
          mediaType: text(version.media_type, 160),
          changeSummary: nullableText(version.change_summary, 500),
          createdAt: date(version.created_at),
        };
      }),
    };
  });

  const checklist = list(source.checklist).map((entry) => {
    const item = record(entry);
    const status = text(item.status, 24) as ChecklistStatus;
    if (!checklistStatuses.has(status)) throw new Error("invalid_archive_projection");
    return {
      id: uuid(item.id),
      label: text(item.label, 180),
      category: category(item.category),
      isRequired: boolean(item.is_required),
      status,
      archiveItemId: item.archive_item_id === null ? null : uuid(item.archive_item_id),
      notes: nullableText(item.notes, 1000),
    };
  });

  const confirmations = list(source.confirmations).map((entry) => {
    const confirmation = record(entry);
    const role = text(confirmation.confirmation_role, 16) as "outgoing" | "incoming";
    if (role !== "outgoing" && role !== "incoming") throw new Error("invalid_archive_projection");
    return {
      id: uuid(confirmation.id),
      confirmedBy: text(confirmation.confirmed_by, 160),
      confirmationRole: role,
      confirmedAt: date(confirmation.confirmed_at),
    };
  });

  return {
    clubs,
    selectedClubId,
    canManage: boolean(source.can_manage),
    years,
    selectedYearId,
    items,
    checklist,
    confirmations,
    missingRequiredCategories: list(source.missing_required_categories).map(category),
  };
}

export function rotaryYearLabel(startYear: number) {
  return `${startYear}–${String((startYear + 1) % 100).padStart(2, "0")}`;
}

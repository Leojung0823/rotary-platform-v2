import { describe, expect, it } from "vitest";
import { parseArchivePageProjection, rotaryYearLabel } from "./contracts";

const clubId = "11111111-1111-4111-8111-111111111111";
const yearId = "22222222-2222-4222-8222-222222222222";
const itemId = "33333333-3333-4333-8333-333333333333";
const versionId = "44444444-4444-4444-8444-444444444444";

function projection() {
  return {
    clubs: [{ club_id: clubId, club_code: "RC-A", club_name: "測試社" }],
    selected_club_id: clubId,
    can_manage: true,
    years: [{ id: yearId, start_year: 2026, theme: "服務", president_name: "王社長", secretary_name: null, handover_status: "preparation" }],
    selected_year_id: yearId,
    items: [{
      id: itemId,
      category: "meeting_minutes",
      title: "七月例會紀錄",
      description: null,
      folder_path: "會議/例會",
      tags: ["例會"],
      confidentiality: "club_internal",
      updated_at: "2026-08-20T00:00:00Z",
      versions: [{ id: versionId, version_number: 1, original_filename: "minutes.pdf", file_size_bytes: 1024, media_type: "application/pdf", change_summary: null, created_at: "2026-08-20T00:00:00Z" }],
    }],
    checklist: [],
    confirmations: [],
    missing_required_categories: ["reports"],
  };
}

describe("archive page contracts", () => {
  it("maps years, immutable versions, and missing categories", () => {
    const parsed = parseArchivePageProjection(projection());
    expect(parsed.items[0]?.versions[0]?.originalFilename).toBe("minutes.pdf");
    expect(parsed.missingRequiredCategories).toEqual(["reports"]);
    expect(rotaryYearLabel(2026)).toBe("2026–27");
  });

  it("rejects a year outside the returned club projection", () => {
    expect(() => parseArchivePageProjection({
      ...projection(),
      selected_year_id: "55555555-5555-4555-8555-555555555555",
    })).toThrow("invalid_archive_projection");
  });

  it("rejects unknown confidentiality", () => {
    const value = projection();
    value.items[0]!.confidentiality = "public";
    expect(() => parseArchivePageProjection(value)).toThrow("invalid_archive_projection");
  });
});

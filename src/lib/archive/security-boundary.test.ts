import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
}

describe("archive and handover security boundary", () => {
  const migration = source("supabase/migrations/20260820002000_archive_handover.sql");
  const upload = source("src/app/api/v1/archive/uploads/route.ts");
  const download = source("src/app/api/v1/archive/versions/[versionId]/download/route.ts");
  const memberPage = source("src/app/(authenticated)/archives/page.tsx");
  const managementRoute = source("src/app/(authenticated)/clubs/[clubId]/archives/page.tsx");
  const actions = source("src/app/archive-actions.ts");
  const verification = source("supabase/verification/archive_handover_security.sql");

  it("keeps the bucket private and serves downloads through short signed URLs", () => {
    expect(migration).toContain("'rotary-archives'");
    expect(migration).toContain("public = false");
    expect(download).toContain("createSignedUrl");
    expect(download).toContain("60,");
    expect(download).toContain("authorize_archive_download");
  });

  it("makes versions append-only and denies direct browser table access", () => {
    expect(migration).toContain("archive_version_immutable");
    expect(migration).toContain("archive_version_status_transition_invalid");
    expect(migration).toContain("archive_hard_delete_forbidden");
    expect(migration).toContain("revoke all on table public.archive_item_versions from public, anon, authenticated");
    expect(upload).not.toContain('.from("archive_item_versions")');
  });

  it("checks tenant authority again for uploads, downloads, and confidential items", () => {
    expect(migration).toContain("public.current_can_manage_archive(p_club_id)");
    expect(migration).toContain("public.current_can_access_archive(p_club_id)");
    expect(migration).toContain("item.confidentiality = 'club_internal' or public.current_can_manage_archive(p_club_id)");
    expect(upload).toContain("archiveMutationAllowed(request)");
    expect(upload).toContain('upsert: false');
  });

  it("requires named confirmations from two different accounts", () => {
    expect(migration).toContain("incoming.confirmed_by_app_account_id <> outgoing.confirmed_by_app_account_id");
    expect(migration).toContain("handover_checklist_incomplete");
    expect(migration).toContain("archive.handover_confirmed");
  });

  it("keeps the database fixture aligned with every archive management RPC", () => {
    for (const rpc of [
      "create_rotary_year",
      "update_rotary_year",
      "create_archive_item",
      "update_archive_item",
      "archive_archive_item",
      "begin_archive_version",
      "complete_archive_version",
      "fail_archive_version",
      "update_handover_checklist",
      "confirm_archive_handover",
    ]) {
      expect(verification).toContain(`public.${rpc}(`);
    }
    expect(verification).toContain("same-club regular member");
    expect(verification).toContain("Cross-club users fail closed");
  });

  it("keeps member browsing separate from manager mutations", () => {
    expect(memberPage).not.toContain("createRotaryYearAction");
    expect(memberPage).not.toContain("ArchiveUploadForm");
    expect(managementRoute).toContain('rpc("get_my_archive_page"');
    expect(managementRoute).toContain("!page.canManage");
    expect(managementRoute).toContain("<ArchiveManagementPanel");
    expect(actions).toContain("/clubs/${encodeURIComponent(clubId)}/archives");
    expect(actions).toContain('revalidatePath("/archives")');
    expect(actions).toContain("mode: \"management\"");
  });

  it("keeps the old management URL as a redirect instead of a second manager page", () => {
    expect(memberPage).toContain('query.mode === "management"');
    expect(memberPage).toContain("redirect(\"/access-denied\")");
    expect(memberPage).toContain("page.selectedClubId.toLowerCase() !== requestedClubId");
    expect(memberPage).toContain("/clubs/${encodeURIComponent(page.selectedClubId)}/archives?mode=management");
    expect(memberPage).toContain("幹部功能已移至社務管理模式。");
    expect(memberPage).not.toContain("ArchiveManagementPanel");
  });
});

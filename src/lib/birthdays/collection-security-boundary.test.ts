import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
}

describe("birthday collection security boundary", () => {
  const migration = source("supabase/migrations/20260824000600_birthday_wish_collection_core.sql");
  const runner = source("supabase/migrations/20260824000700_birthday_wish_assignment_runner.sql");
  const publication = source("supabase/migrations/20260824000800_birthday_wish_collection_publication.sql");
  const scheduler = source("supabase/migrations/20260824000900_birthday_wish_collection_scheduler.sql");
  const review = source("supabase/migrations/20260824001000_birthday_wish_collection_review.sql");
  const schedulerRoute = source("src/app/api/internal/birthday-collection/scheduler/route.ts");
  const schedulerWorkflow = source(".github/workflows/birthday-collection-scheduler.yml");
  const page = source("src/app/(authenticated)/birthday-collection/page.tsx");
  const managementPage = source("src/components/birthday-collection/birthday-collection-management.tsx");
  const managementRoute = source("src/app/(authenticated)/clubs/[clubId]/birthday-collection/page.tsx");
  const actions = source("src/app/birthday-collection-actions.ts");

  it("fails closed before loading the collection projection when the flag is off", () => {
    expect(page).toContain('key: "birthday_wishes_collection_v1"');
    expect(page).toContain("if (!evaluation.enabled || !query.clubId) notFound();");
    expect(page.indexOf("if (!evaluation.enabled || !query.clubId) notFound();"))
      .toBeLessThan(page.indexOf("await createClient()"));
  });

  it("keeps member writes RPC-only and does not accept a caller-supplied author", () => {
    expect(actions).toContain('rpc("save_birthday_wish_submission"');
    expect(actions).toContain('rpc("delete_own_birthday_wish_submission"');
    expect(actions).toContain('rpc("publish_birthday_wish_submission"');
    expect(actions).toContain('rpc("ensure_birthday_wish_collection_notification"');
    expect(actions).toContain('rpc("decline_birthday_wish_assignment"');
    expect(actions).toContain('rpc("hide_birthday_wish_submission"');
    expect(actions).toContain('rpc("create_birthday_wish_question"');
    expect(actions).toContain('rpc("update_birthday_wish_question"');
    expect(actions).toContain("managementInvalidInputPath");
    expect(actions).toContain('revalidatePath("/birthday-collection")');
    expect(actions).toContain("/clubs/${encodeURIComponent(clubId)}/birthday-collection");
    expect(actions).not.toMatch(/\.from\("birthday_wish_/u);
    expect(actions).not.toContain("author_app_account_id");
  });

  it("keeps the runner and projection server-authorized, tenant-scoped, and fail-closed", () => {
    expect(runner).toContain("security definer");
    expect(runner).toContain("set search_path = pg_catalog, public, auth");
    expect(runner).toContain("public.current_can_manage_club(p_club_id)");
    expect(runner).toContain("membership.club_id = p_club_id");
    expect(migration).toContain("public.current_can_access_birthday_club(p_club_id)");
    expect(migration).toContain("campaign_status not in ('draft', 'collecting')");
    expect(migration).toContain("birthday_submission_published_immutable");
    expect(migration).toContain("birthday_participant_batch_assignee_unique");
    expect(migration).toContain("birthday_participant_batch_question_unique");
    expect(migration).toContain("revoke all on function public.get_my_birthday_wish_collection_page(uuid) from public, anon");
    expect(publication).toContain("public.current_can_manage_club(p_club_id)");
    expect(publication).toContain("public.current_can_access_birthday_club(p_club_id)");
    expect(publication).toContain("author_is_hidden");
    expect(publication).toContain("revoke all on function public.list_published_birthday_wish_submissions(uuid) from public, anon");
  });

  it("keeps the automatic scheduler outside the browser trust boundary", () => {
    expect(scheduler).toContain("security definer");
    expect(scheduler).toContain("revoke all on function public.run_birthday_wish_collection_scheduler(timestamptz) from public, anon, authenticated");
    expect(scheduler).toContain("grant execute on function public.run_birthday_wish_collection_scheduler(timestamptz) to service_role");
    expect(scheduler).toContain("action_path");
    expect(schedulerRoute).toContain("hasValidBirthdayCollectionSchedulerSecret");
    expect(schedulerRoute).toContain('new Set(["staging", "production"])');
    expect(schedulerRoute).toContain("hostedEnvironments.has(appEnvironment)");
    expect(schedulerRoute).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(schedulerWorkflow).toContain("environment:\n      name: staging");
    expect(schedulerWorkflow).not.toContain("production");
  });

  it("keeps review history append-only and links message state to one assignment", () => {
    expect(review).toContain("create table public.birthday_wish_submission_events");
    expect(review).toContain("alter table public.birthday_wish_submission_events enable row level security");
    expect(review).toContain("revoke all on table public.birthday_wish_submission_events from public, anon, authenticated");
    expect(review).toContain("birthday_submission_event_append_only");
    expect(review).toContain("birthday_participant_id");
    expect(review).toContain("needs_resubmission");
    expect(review).toContain("grant execute on function public.hide_birthday_wish_submission(uuid, uuid) to authenticated");
    expect(review).toContain("grant execute on function public.decline_birthday_wish_assignment(uuid, uuid) to authenticated");
    expect(review).toContain("revoke all on function public.append_birthday_wish_submission_event");
    expect(managementPage).toContain("processingHistory");
  });

  it("keeps the manager route tenant-bound and uses one manager projection read", () => {
    expect(managementRoute).toContain('key: "birthday_wishes_collection_v1"');
    expect(managementRoute).toContain('rpc("get_my_birthday_wish_collection_page"');
    expect(managementRoute).toContain('query.mode !== "management"');
    expect(managementRoute).toContain("page.clubId.toLowerCase() !== clubId.toLowerCase()");
    expect(managementRoute).toContain("!page.canManage");
    expect(managementRoute).toContain("parseBirthdayCollectionPageProjection(data, [])");
    expect(managementRoute).not.toContain('rpc("list_published_birthday_wish_submissions"');
  });

  it("keeps the old management URL as a redirect instead of a second manager page", () => {
    expect(page).toContain('query.mode === "management"');
    expect(page).toContain("redirect(\"/access-denied\")");
    expect(page).toContain("/clubs/${encodeURIComponent(managerPage.clubId)}/birthday-collection?mode=management");
    expect(page).toContain("幹部功能已移至社務管理模式。");
    expect(page).not.toContain("BirthdayCollectionManagement");
  });
});

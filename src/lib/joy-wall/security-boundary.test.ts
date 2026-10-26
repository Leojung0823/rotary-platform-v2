import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrationDefining } from "@/lib/attendance/latest-definition";

function source(path: string) { return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"); }

describe("Joy Wall security and UX boundaries", () => {
  const page = source("app/(authenticated)/joy/page.tsx");
  const taskPage = source("app/(authenticated)/tasks/page.tsx");
  const taskMigration = source("../supabase/migrations/20261002000400_joy_iou_member_tasks.sql");
  const moderationPage = source("app/(authenticated)/clubs/[clubId]/joy/moderation/page.tsx");
  const questionManagerPage = source("app/(authenticated)/clubs/[clubId]/joy/questions/page.tsx");
  const suggestionManagerPage = source("app/(authenticated)/clubs/[clubId]/joy/suggestions/page.tsx");
  const questionManagerComponent = source("components/joy-wall/joy-question-manager.tsx");
  const questionMigration = source("../supabase/migrations/20261003000200_joy_question_bank_batch_dispatch.sql");
  const component = source("components/joy-wall/joy-wall.tsx");
  const postsRoute = source("app/api/v1/joy/posts/route.ts");
  const itemRoute = source("app/api/v1/joy/posts/[postId]/route.ts");
  const commentRoute = source("app/api/v1/joy/posts/[postId]/comments/route.ts");
  const reportRoute = source("app/api/v1/joy/reports/route.ts");
  const createIouRoute = source("app/api/v1/joy/ious/route.ts");
  const iouActionRoute = source("app/api/v1/joy/ious/[postId]/route.ts");
  const suggestionsRoute = source("app/api/v1/joy/suggestions/route.ts");
  const draftsRoute = source("app/api/v1/joy/drafts/route.ts");
  const draftItemRoute = source("app/api/v1/joy/drafts/[draftId]/route.ts");
  const draftPublishRoute = source("app/api/v1/joy/drafts/[draftId]/publish/route.ts");
  const draftsMigration = source("../supabase/migrations/20261026000400_joy_post_drafts.sql");
  const draftDeadlineMigration = source("../supabase/migrations/20261026000600_joy_post_draft_interaction_deadlines.sql");
  const suggestionItemRoute = source("app/api/v1/joy/suggestions/[suggestionId]/route.ts");
  const suggestionMigration = source("../supabase/migrations/20261026000200_joy_anonymous_suggestions.sql");
  const targetMigration = source("../supabase/migrations/20261026000300_joy_target_associations.sql");
  const joyPage = source("app/(authenticated)/joy/page.tsx");
  const favoriteMigration = source("../supabase/migrations/20261003000300_joy_post_favorites.sql");
  const recipientActionsMigrationFile = migrationDefining("acknowledge_joy_post_receipt");
  const recipientActionsMigration = recipientActionsMigrationFile
    ? source(`../supabase/migrations/${recipientActionsMigrationFile}`)
    : "";
  const mutationRoutes = [
    postsRoute,
    itemRoute,
    commentRoute,
    source("app/api/v1/joy/posts/[postId]/reaction/route.ts"),
    source("app/api/v1/joy/posts/[postId]/favorite/route.ts"),
    source("app/api/v1/joy/posts/[postId]/receipt/route.ts"),
    source("app/api/v1/joy/posts/[postId]/report/route.ts"),
    reportRoute,
    createIouRoute,
    iouActionRoute,
    suggestionsRoute,
    suggestionItemRoute,
    draftsRoute,
    draftItemRoute,
    draftPublishRoute,
  ];

  it("fails closed before loading data when the feature flag is off", () => {
    expect(page).toContain('key: "joy_wall_v1"');
    expect(page.indexOf("if (!evaluation.enabled) notFound();")).toBeLessThan(page.indexOf("createClient()"));
    expect(moderationPage).toContain('key: "joy_wall_v1"');
    expect(moderationPage).toContain('requireClubPermission(clubId, "joy.moderate")');
    expect(moderationPage).toContain('query.mode !== "management"');
  });

  it("requires authenticated server RPCs and same-origin checks for every mutation", () => {
    expect(postsRoute).toContain("authenticatedJoyClient");
    expect(postsRoute).toContain('p_favorites_only: view === "favorites"');
    expect(postsRoute).toContain("joyMutationAllowed(request)");
    expect(itemRoute.match(/joyMutationAllowed\(request\)/gu)).toHaveLength(2);
    expect(commentRoute).toContain("joyMutationAllowed(request)");
    expect(reportRoute).toContain("joyMutationAllowed(request)");
    expect(createIouRoute).toContain('client.rpc("create_joy_iou"');
    expect(iouActionRoute).toContain('client.rpc("act_joy_iou"');
    expect(source("app/api/v1/joy/posts/[postId]/favorite/route.ts")).toContain('client.rpc("set_joy_post_favorite"');
    for (const route of mutationRoutes) {
      expect(route).toContain("featureEnabled");
      expect(route).toContain("joyFailure(404)");
    }
  });

  it("renders content as text and keeps personal visibility selected by the author", () => {
    expect(component).toContain("{post.content}");
    expect(component).not.toContain("dangerouslySetInnerHTML");
    expect(component).toContain("visibilityScope");
    expect(component).toContain("audienceMembershipIds");
    expect(component).toContain('cache: "no-store"');
  });

  it("keeps IOU reminders private and opens only an actionable participant's post", () => {
    expect(taskPage).toContain('key: "joy_wall_v1"');
    expect(taskPage).toContain("p_include_joy_tasks: joyEvaluation.enabled");
    expect(taskMigration).toContain("post.author_app_account_id = actor_id");
    expect(taskMigration).toContain("item.recipient_membership_id = active_membership_id");
    expect(taskMigration).toContain("public.current_can_read_joy_post(post.id, p_club_id, actor_id, actor_membership_id)");
    expect(page).toContain('supabase.rpc("get_my_joy_iou_post"');
    expect(page).toContain("focusIouId");
  });

  it("keeps answer tasks limited to unanswered, selected question recipients", () => {
    expect(taskMigration).toContain("post.post_type = 'question'");
    expect(taskMigration).toContain("post.visibility_scope in ('selected', 'private')");
    expect(taskMigration).toContain("audience.membership_id = active_membership_id");
    expect(taskMigration).toContain("answer.author_app_account_id = actor_id");
    expect(taskMigration).toContain("answer.comment_type = 'answer'");
    expect(taskMigration).toContain("public.get_my_joy_question_post(uuid, uuid)");
    expect(page).toContain("focusPostId");
  });

  it("projects only the caller's favorite state in the initial and focused feed", () => {
    expect(joyPage).toContain("p_favorites_only: false");
    expect(joyPage).toContain('supabase.rpc("list_joy_posts_with_interaction_deadlines"');
    expect(joyPage).toContain('supabase.rpc("get_my_joy_question_post_with_interaction_deadline"');
    expect(postsRoute).toContain('client.rpc("create_joy_post_with_interaction_deadline"');
    expect(itemRoute).toContain('client.rpc("update_own_joy_post_with_interaction_deadline"');
    expect(component).toContain('post.interactions_open');
    expect(component).toContain("歷史內容仍可閱讀");
    expect(source("../supabase/migrations/20261026000500_joy_post_interaction_deadlines.sql"))
      .toContain("joy_post_interactions_closed");
    expect(source("../supabase/migrations/20261026000500_joy_post_interaction_deadlines.sql"))
      .toContain("public.get_my_joy_question_post_with_recipient_actions(p_club_id, p_post_id)");
    expect(favoriteMigration).toContain("public.get_my_joy_question_post(p_club_id, p_post_id)");
    expect(favoriteMigration).toContain("favorite.app_account_id = actor_id");
  });

  it("keeps Joy target associations private and rechecks target-specific access", () => {
    expect(targetMigration).toContain("alter table public.joy_targets enable row level security");
    expect(targetMigration).toContain("revoke all on table public.joy_targets from public, anon, authenticated, service_role");
    expect(targetMigration).toContain("foreign key (event_id, club_id)");
    expect(targetMigration).toContain("foreign key (rotary_year_id, club_id)");
    expect(targetMigration).toContain("foreign key (birthday_campaign_id, club_id)");
    expect(targetMigration).toContain("role_key text references public.role_definitions");
    expect(targetMigration).toContain("public.event_includes_current_member(event.id)");
    expect(targetMigration).toContain("public.current_can_access_archive(p_club_id)");
    expect(targetMigration).toContain("public.joy_visible_birthday_campaigns(p_club_id)");
    expect(targetMigration).toContain("has_function_privilege(");
    expect(targetMigration).toContain("'birthday_year', campaigns.birthday_year");
    expect(targetMigration).not.toContain("'birthday_date', campaigns.birthday_date");
    expect(targetMigration).toContain("public.current_can_read_joy_post(p_post_id, p_club_id");
    expect(postsRoute).toContain("p_role_keys: body.roleKeys");
    expect(postsRoute).toContain("p_birthday_campaign_ids: body.birthdayCampaignIds");
    expect(component).toContain("只顯示職稱、不顯示任職社員");
    expect(targetMigration).toContain("public.create_joy_post_with_targets");
    expect(targetMigration).toContain("public.list_joy_posts_with_targets");
  });

  it("limits receipt acknowledgement and hide requests to selected recipients", () => {
    const receiptRoute = source("app/api/v1/joy/posts/[postId]/receipt/route.ts");
    expect(receiptRoute).toContain('client.rpc("acknowledge_joy_post_receipt"');
    expect(receiptRoute).toContain("joyMutationAllowed(request)");
    expect(component).toContain('"recipient_hide_request"');
    expect(component).toContain("post.can_acknowledge_receipt");
    expect(component).toContain("post.can_request_hide");
    expect(component).toContain("貼文不會因此立即消失");
    expect(recipientActionsMigration).toContain("public.current_can_read_joy_post");
    expect(recipientActionsMigration).toContain("audience.membership_id = actor_membership_id");
    expect(recipientActionsMigration).toContain("public.joy_post_acknowledgements");
    expect(recipientActionsMigration).toContain("'recipient_hide_requested'");
  });

  it("keeps the question bank behind management mode, club permission, and the existing fail-closed flag", () => {
    expect(questionManagerPage).toContain('key: "joy_wall_v1"');
    expect(questionManagerPage).toContain('requireClubPermission(clubId, "joy.moderate")');
    expect(questionManagerPage).toContain('query.mode !== "management"');
    expect(page).toContain('canModerate && mode === "management"');
    expect(page).toContain("/joy/questions?mode=management");
    expect(questionManagerComponent).toContain("crypto.randomUUID()");
    expect(questionManagerComponent).toContain("每位被選社員會收到一則待回答提問");
    expect(questionManagerComponent).toContain("不會公開給其他社員");
  });

  it("keeps anonymous suggestions club-scoped, officer-reviewed, and author-free in the club projection", () => {
    expect(suggestionManagerPage).toContain('requireClubPermission(clubId, "joy.moderate")');
    expect(suggestionManagerPage).toContain('query.mode !== "management"');
    expect(page).toContain("<JoySuggestionBox clubId={selectedClub.club_id} />");
    expect(page).toContain("/joy/suggestions?mode=management");
    expect(suggestionsRoute).toContain('client.rpc("create_joy_suggestion"');
    expect(suggestionsRoute).toContain('client.rpc("list_joy_suggestions"');
    expect(suggestionItemRoute).toContain('client.rpc("review_joy_suggestion"');
    expect(suggestionMigration).toContain("joy_private.joy_suggestion_identities");
    expect(suggestionMigration).toContain("revoke all on schema joy_private from public, anon, authenticated, service_role");
    expect(suggestionMigration).toContain("create or replace function public.list_joy_suggestions");
    expect(suggestionMigration).toContain("'suggestion_created'");
    expect(suggestionMigration).toContain("'suggestion_reviewed'");
    const projection = suggestionMigration.split("create or replace function public.list_joy_suggestions")[1]?.split("create or replace function public.review_joy_suggestion")[0] ?? "";
    expect(projection).not.toContain("author_app_account_id");
    expect(projection).not.toContain("author_membership_id");
  });

  it("keeps unpublished Joy drafts private and makes publishing revalidate through the existing post RPC", () => {
    for (const route of [draftsRoute, draftItemRoute, draftPublishRoute]) {
      expect(route).toContain("authenticatedJoyClient");
      expect(route).toContain("joyMutationAllowed(request)");
      expect(route).toContain("featureEnabled");
    }
    expect(draftsRoute).toContain('client.rpc("list_my_joy_post_drafts"');
    expect(draftsRoute).toContain('client.rpc("save_my_joy_post_draft"');
    expect(draftItemRoute).toContain('client.rpc("delete_my_joy_post_draft"');
    expect(draftPublishRoute).toContain('client.rpc("publish_my_joy_post_draft"');
    expect(draftsMigration).toContain("alter table public.joy_post_drafts enable row level security");
    expect(draftsMigration).toContain("from public, anon, authenticated, service_role");
    expect(draftsMigration).toContain("draft.author_app_account_id = actor_id");
    expect(draftsMigration).toContain("public.create_joy_post_with_targets(");
    expect(draftsMigration).toContain("event_type, details");
    expect(draftsMigration).toContain("jsonb_build_object('post_type', p_post_type)");
    expect(draftsMigration).toContain("interaction_deadline_on date");
    expect(draftDeadlineMigration).toContain("public.create_joy_post_with_interaction_deadline(");
    expect(draftDeadlineMigration).toContain("draft.interaction_deadline_on");
  });

  it("keeps question-bank mutations server-authorized, idempotent, and answer-private", () => {
    const mutationRoutes = [
      source("app/api/v1/joy/question-bank/route.ts"),
      source("app/api/v1/joy/question-bank/[promptId]/route.ts"),
      source("app/api/v1/joy/question-batches/route.ts"),
    ];
    for (const route of mutationRoutes) {
      expect(route).toContain("authenticatedJoyClient");
      expect(route).toContain("joyMutationAllowed(request)");
      expect(route).toContain("featureEnabled");
      expect(route).toContain("joyFailure(404)");
    }
    expect(questionMigration).toContain("joy_question_batch_idempotency_conflict");
    expect(questionMigration).toContain("joy_question_batch_assignments_prompt_unique");
    expect(questionMigration).toContain("visibility_scope");
    expect(questionMigration).toContain("joy_batch_question_immutable");
    expect(questionMigration).toContain("'answered', exists (");
    expect(questionMigration).not.toContain("'answer_content'");
  });
});

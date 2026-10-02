import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) { return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"); }

describe("Joy Wall security and UX boundaries", () => {
  const page = source("app/(authenticated)/joy/page.tsx");
  const taskPage = source("app/(authenticated)/tasks/page.tsx");
  const taskMigration = source("../supabase/migrations/20261002000400_joy_iou_member_tasks.sql");
  const moderationPage = source("app/(authenticated)/clubs/[clubId]/joy/moderation/page.tsx");
  const questionManagerPage = source("app/(authenticated)/clubs/[clubId]/joy/questions/page.tsx");
  const questionManagerComponent = source("components/joy-wall/joy-question-manager.tsx");
  const questionMigration = source("../supabase/migrations/20261003000200_joy_question_bank_batch_dispatch.sql");
  const component = source("components/joy-wall/joy-wall.tsx");
  const postsRoute = source("app/api/v1/joy/posts/route.ts");
  const itemRoute = source("app/api/v1/joy/posts/[postId]/route.ts");
  const commentRoute = source("app/api/v1/joy/posts/[postId]/comments/route.ts");
  const reportRoute = source("app/api/v1/joy/reports/route.ts");
  const createIouRoute = source("app/api/v1/joy/ious/route.ts");
  const iouActionRoute = source("app/api/v1/joy/ious/[postId]/route.ts");
  const mutationRoutes = [
    postsRoute,
    itemRoute,
    commentRoute,
    source("app/api/v1/joy/posts/[postId]/reaction/route.ts"),
    source("app/api/v1/joy/posts/[postId]/report/route.ts"),
    reportRoute,
    createIouRoute,
    iouActionRoute,
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
    expect(postsRoute).toContain("joyMutationAllowed(request)");
    expect(itemRoute.match(/joyMutationAllowed\(request\)/gu)).toHaveLength(2);
    expect(commentRoute).toContain("joyMutationAllowed(request)");
    expect(reportRoute).toContain("joyMutationAllowed(request)");
    expect(createIouRoute).toContain('client.rpc("create_joy_iou"');
    expect(iouActionRoute).toContain('client.rpc("act_joy_iou"');
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
    expect(page).toContain('supabase.rpc("get_my_joy_question_post"');
    expect(page).toContain("focusPostId");
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

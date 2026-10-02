import { describe, expect, it } from "vitest";
import { parseJoyPost, parseJoyQuestionBatchDetail, parseJoyQuestionManagerPage, parseJoyQuestionRecipients } from "./contracts";

const basePost = {
  id: "64000000-0000-4000-8000-000000000001",
  post_type: "question",
  title: null,
  content: "有什麼值得推薦？",
  visibility_scope: "private",
  post_status: "published",
  created_at: "2026-10-02T00:00:00.000Z",
  updated_at: "2026-10-02T00:00:00.000Z",
  author_display_name: "社員甲",
  author_avatar_url: null,
  can_edit: false,
  can_archive: false,
  can_answer: false,
  is_hidden: false,
  comment_count: 0,
  reaction_counts: {},
  my_reaction: null,
  iou: null,
};

describe("Joy Wall response contracts", () => {
  it("requires a server-projected answer capability", () => {
    expect(parseJoyPost(basePost).can_answer).toBe(false);
    expect(parseJoyPost({ ...basePost, can_answer: true }).can_answer).toBe(true);
    const withoutCapability = Object.fromEntries(
      Object.entries(basePost).filter(([key]) => key !== "can_answer"),
    ) as Record<string, unknown>;
    expect(() => parseJoyPost(withoutCapability)).toThrow("invalid_joy_post_projection");
  });

  it("accepts a private IOU projection only with a valid lifecycle state", () => {
    const iou = {
      status: "proposed", is_overdue: false, due_on: "2026-10-10",
      recipient_display_name: "社員乙", viewer_role: "promisor",
      can_accept: false, can_decline: false, can_start: false, can_confirm_completion: false, can_cancel: true,
      recipient_response_note: null, cancellation_note: null,
      promisor_completion_confirmed: false, recipient_completion_confirmed: false,
      promisor_completion_note: null, recipient_completion_note: null,
    };
    expect(parseJoyPost({ ...basePost, post_type: "iou", iou })).toMatchObject({ post_type: "iou", iou });
    expect(() => parseJoyPost({ ...basePost, post_type: "iou", iou: null })).toThrow("invalid_joy_post_projection");
  });

  it("validates manager prompt counts and never accepts editable system prompts", () => {
    const page = {
      distinct_active_prompt_count: 1,
      prompts: [{ id: "prompt-1", prompt_text: "最近有什麼值得感謝？", source: "platform", is_active: true,
        sort_order: 10, can_edit: false }],
      batches: [{ id: "batch-1", title: "本月提問", created_at: "2026-10-02T00:00:00.000Z",
        assignment_count: 1, answered_count: 0, unavailable_count: 0 }],
    };
    expect(parseJoyQuestionManagerPage(page)).toMatchObject({ distinct_active_prompt_count: 1 });
    expect(() => parseJoyQuestionManagerPage({ ...page, prompts: [{ ...page.prompts[0], can_edit: true }] }))
      .toThrow();
    expect(() => parseJoyQuestionManagerPage({ ...page, batches: [{ ...page.batches[0], answered_count: 2 }] }))
      .toThrow("invalid_joy_question_manager_page");
  });

  it("validates recipient and batch projections without requiring answer contents", () => {
    expect(parseJoyQuestionRecipients([{
      membership_id: "64000000-0000-4000-8000-000000000002", display_name: "社員乙", avatar_url: null,
    }])).toHaveLength(1);
    expect(parseJoyQuestionBatchDetail({
      id: "batch-1", title: "本月提問", created_at: "2026-10-02T00:00:00.000Z",
      assignments: [{ post_id: "post-1", recipient_membership_id: "member-1", recipient_display_name: "社員乙",
        prompt_text: "最近有什麼值得感謝？", answered: true, available: true }],
    }).assignments[0]).toMatchObject({ answered: true, available: true });
    expect(() => parseJoyQuestionBatchDetail({ id: "batch-1", title: "本月提問", created_at: "bad", assignments: [] }))
      .toThrow("invalid_joy_question_batch_detail");
  });
});

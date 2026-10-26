import { describe, expect, it } from "vitest";
import {
  parseJoyPost,
  parseJoyPostDraft,
  parseJoyPostDrafts,
  parseJoyQuestionBatchDetail,
  parseJoyQuestionManagerPage,
  parseJoyQuestionRecipients,
  parseJoySuggestions,
  parseJoyTargetOptions,
  parseJoyMemberBlocks,
  parseJoyMemberBlockResult,
} from "./contracts";

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
  interaction_deadline_on: null,
  interactions_open: true,
  is_hidden: false,
  comment_count: 0,
  reaction_counts: {},
  my_reaction: null,
  iou: null,
};

describe("Joy Wall response contracts", () => {
  it("validates the caller-owned member block projection and mutation result", () => {
    const member = {
      membership_id: "64000000-0000-4000-8000-000000000001",
      display_name: "社員甲",
      avatar_url: null,
    };
    expect(parseJoyMemberBlocks({ blocked_members: [member] })).toEqual([member]);
    expect(parseJoyMemberBlockResult({ membership_id: member.membership_id, blocked: true }))
      .toEqual({ membership_id: member.membership_id, blocked: true });
    expect(() => parseJoyMemberBlocks({ blocked_members: [member, member] })).toThrow("invalid_joy_member_blocks_projection");
    expect(() => parseJoyMemberBlocks({ blocked_members: [{ ...member, private_email: "hidden@example.test" }] }))
      .toThrow("invalid_joy_member_blocks_projection");
    expect(() => parseJoyMemberBlocks({ blocked_members: Array(251).fill(member) }))
      .toThrow("invalid_joy_member_blocks_projection");
    expect(() => parseJoyMemberBlockResult({ membership_id: "invalid", blocked: true }))
      .toThrow("invalid_joy_member_block_result");
  });

  it("accepts private, incomplete drafts but rejects IOUs, oversized fields, and unknown identity data", () => {
    const draft = {
      id: "64000000-0000-4000-8000-000000000009",
      post_type: "blessing",
      title: null,
      content: "",
      visibility_scope: "selected",
      audience_membership_ids: [],
      event_ids: [],
      rotary_year_ids: [],
      role_keys: [],
      birthday_campaign_ids: [],
      interaction_deadline_on: "2026-11-30",
      created_at: "2026-10-26T00:00:00.000Z",
      updated_at: "2026-10-26T00:00:00.000Z",
    };
    expect(parseJoyPostDrafts({ drafts: [draft] })).toEqual([draft]);
    expect(() => parseJoyPostDraft({ ...draft, post_type: "iou" })).toThrow("invalid_joy_post_draft_projection");
    expect(() => parseJoyPostDraft({ ...draft, author_app_account_id: "64000000-0000-4000-8000-000000000010" }))
      .toThrow("invalid_joy_post_draft_projection");
    expect(() => parseJoyPostDraft({ ...draft, audience_membership_ids: ["not-a-uuid"] }))
      .toThrow("invalid_joy_post_draft_projection");
    expect(() => parseJoyPostDraft({ ...draft, interaction_deadline_on: "2026-02-30" }))
      .toThrow("invalid_joy_post_draft_projection");
    expect(() => parseJoyPostDrafts({ drafts: Array(21).fill(draft) }))
      .toThrow("invalid_joy_post_drafts_projection");
  });

  it("requires a server-projected answer capability", () => {
    expect(parseJoyPost(basePost).can_answer).toBe(false);
    expect(parseJoyPost(basePost).is_favorited).toBe(false);
    expect(parseJoyPost(basePost).is_pinned).toBe(false);
    expect(parseJoyPost(basePost).can_acknowledge_receipt).toBe(false);
    expect(parseJoyPost(basePost).can_request_hide).toBe(false);
    expect(parseJoyPost({ ...basePost, can_answer: true }).can_answer).toBe(true);
    expect(parseJoyPost({ ...basePost, is_favorited: true }).is_favorited).toBe(true);
    expect(parseJoyPost({ ...basePost, is_pinned: true }).is_pinned).toBe(true);
    expect(() => parseJoyPost({ ...basePost, is_pinned: "true" })).toThrow("invalid_joy_post_projection");
    const withoutCapability = Object.fromEntries(
      Object.entries(basePost).filter(([key]) => key !== "can_answer"),
    ) as Record<string, unknown>;
    expect(() => parseJoyPost(withoutCapability)).toThrow("invalid_joy_post_projection");
  });

  it("validates an optional interaction deadline and server-computed closed state", () => {
    expect(parseJoyPost({
      ...basePost,
      interaction_deadline_on: "2026-10-25",
      interactions_open: false,
    })).toMatchObject({ interaction_deadline_on: "2026-10-25", interactions_open: false });
    expect(() => parseJoyPost({ ...basePost, interaction_deadline_on: "2026-02-30" }))
      .toThrow("invalid_joy_post_projection");
    expect(() => parseJoyPost({ ...basePost, interactions_open: "false" }))
      .toThrow("invalid_joy_post_projection");
  });

  it("validates private recipient action state without exposing it to other readers", () => {
    const recipient = parseJoyPost({
      ...basePost,
      can_acknowledge_receipt: true,
      receipt_acknowledged_at: null,
      receipt_ack_count: null,
      recipient_count: null,
      can_request_hide: true,
      hide_request_submitted: false,
    });
    expect(recipient).toMatchObject({ can_acknowledge_receipt: true, can_request_hide: true });
    expect(() => parseJoyPost({
      ...basePost,
      can_acknowledge_receipt: true,
      receipt_acknowledged_at: "2026-10-02T00:00:00.000Z",
    })).toThrow("invalid_joy_post_projection");
    expect(() => parseJoyPost({
      ...basePost,
      receipt_ack_count: 2,
      recipient_count: 1,
    })).toThrow("invalid_joy_post_projection");
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

  it("validates same-club target option and post-target projections", () => {
    const options = parseJoyTargetOptions({
      events: [{ id: "event-1", title: "服務活動", starts_at: "2026-10-28T19:00:00.000Z" }],
      rotary_years: [{ id: "year-1", start_year: 2026, theme: "團結服務" }],
      roles: [{ role_key: "president", label: "社長" }],
      birthday_campaigns: [{ id: "campaign-1", recipient_name: "社員甲", birthday_year: 2026 }],
    });
    expect(options.events).toHaveLength(1);
    expect(options.roles).toEqual([{ role_key: "president", label: "社長" }]);
    expect(options.birthday_campaigns).toEqual([{ id: "campaign-1", recipient_name: "社員甲", birthday_year: 2026 }]);
    expect(parseJoyPost({ ...basePost, targets: [{
      target_type: "event", target_id: "event-1", label: "服務活動", detail: "2026-10-28 19:00",
    }, {
      target_type: "role", target_id: "president", label: "社長", detail: null,
    }, {
      target_type: "birthday_campaign", target_id: "campaign-1", label: "社員甲的生日祝福", detail: "2026 年",
    }] }).targets).toHaveLength(3);
    expect(() => parseJoyTargetOptions({
      events: [{ id: "event-1", title: "服務活動", starts_at: "invalid" }], rotary_years: [], roles: [], birthday_campaigns: [],
    })).toThrow("invalid_joy_target_options");
    expect(parseJoyTargetOptions({ events: [], rotary_years: [], roles: [], birthday_campaigns: [
      { id: "campaign-1", recipient_name: "社員甲", birthday_year: 2026, birthday_date: "1980-01-01" },
    ] }).birthday_campaigns).toEqual([{ id: "campaign-1", recipient_name: "社員甲", birthday_year: 2026 }]);
    expect(() => parseJoyPost({ ...basePost, targets: [{
      target_type: "event", target_id: "event-1", label: "", detail: null,
    }] })).toThrow("invalid_joy_post_target");
  });

  it("validates manager prompt counts and never accepts editable system prompts", () => {
    const page = {
      distinct_active_prompt_count: 1,
      prompts: [{ id: "prompt-1", prompt_text: "最近有什麼值得感謝？", source: "platform", is_active: true,
        sort_order: 10, can_edit: false }],
      batches: [{ id: "batch-1", title: "本月提問", created_at: "2026-10-02T00:00:00.000Z",
        due_on: null, assignment_count: 1, answered_count: 0, unavailable_count: 0 }],
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
      due_on: "2026-10-15",
      assignments: [{ post_id: "post-1", recipient_membership_id: "member-1", recipient_display_name: "社員乙",
        prompt_text: "最近有什麼值得感謝？", answered: true, available: true }],
    })).toMatchObject({ due_on: "2026-10-15", assignments: [{ answered: true, available: true }] });
    expect(() => parseJoyQuestionBatchDetail({ id: "batch-1", title: "本月提問", created_at: "bad", due_on: null, assignments: [] }))
      .toThrow("invalid_joy_question_batch_detail");
    expect(() => parseJoyQuestionBatchDetail({ id: "batch-1", title: "本月提問", created_at: "2026-10-02T00:00:00.000Z",
      due_on: "2026-02-30", assignments: [] })).toThrow("invalid_joy_question_batch_detail");
  });

  it("accepts only the anonymous suggestion projection and rejects leaked identity fields", () => {
    const suggestion = {
      suggestion_id: "64000000-0000-4000-8000-000000000011",
      content: "希望增加服務活動回顧。",
      status: "open",
      created_at: "2026-10-26T00:00:00.000Z",
    };
    expect(parseJoySuggestions({ suggestions: [suggestion] })).toEqual([suggestion]);
    expect(() => parseJoySuggestions({ suggestions: [{ ...suggestion, author_display_name: "社員甲" }] }))
      .toThrow("invalid_joy_suggestions_projection");
    expect(() => parseJoySuggestions({ suggestions: [{ ...suggestion, content: "" }] }))
      .toThrow("invalid_joy_suggestions_projection");
  });
});

import { describe, expect, it } from "vitest";
import {
  parseCreateJoyPostBody,
  parseCreateJoyIouBody,
  parseJoyClubId,
  parseJoyLimit,
  parseJoyIouActionBody,
  parseJoyModerationBody,
  parseJoyReactionBody,
  parseJoyFavoriteBody,
  parseJoyPinBody,
  parseJoyReportBody,
  parseUpdateJoyPostBody,
  parseCreateJoyQuestionPromptBody,
  parseUpdateJoyQuestionPromptBody,
  parseJoyQuestionBatchBody,
  parseCreateJoySuggestionBody,
  parseJoySuggestionReviewBody,
  parseJoySuggestionId,
  parseJoyPostDraftBody,
  parseJoyMemberBlockBody,
} from "./validation";

const memberOne = "64000000-0000-4000-8000-000000000001";

describe("Joy Wall input validation", () => {
  it("requires exact target counts for private and selected visibility", () => {
    expect(parseCreateJoyPostBody({
      postType: "blessing", title: "你好", content: "祝你順心", visibilityScope: "private",
      audienceMembershipIds: [memberOne],
    })).toMatchObject({ visibilityScope: "private", audienceMembershipIds: [memberOne] });
    expect(parseCreateJoyPostBody({
      postType: "memory", title: null, content: "活動回憶", visibilityScope: "club", audienceMembershipIds: [],
      eventIds: ["64000000-0000-4000-8000-000000000002"],
      rotaryYearIds: ["64000000-0000-4000-8000-000000000003"],
      roleKeys: ["president"],
      birthdayCampaignIds: ["64000000-0000-4000-8000-000000000004"],
      interactionDeadlineOn: "2026-11-30",
    })).toMatchObject({
      eventIds: ["64000000-0000-4000-8000-000000000002"],
      rotaryYearIds: ["64000000-0000-4000-8000-000000000003"],
      roleKeys: ["president"],
      birthdayCampaignIds: ["64000000-0000-4000-8000-000000000004"],
      interactionDeadlineOn: "2026-11-30",
    });
    expect(() => parseCreateJoyPostBody({
      postType: "memory", title: null, content: "活動回憶", visibilityScope: "club", audienceMembershipIds: [],
      eventIds: ["64000000-0000-4000-8000-000000000002", "64000000-0000-4000-8000-000000000002"],
    })).toThrow();
    expect(() => parseCreateJoyPostBody({
      postType: "memory", title: null, content: "活動回憶", visibilityScope: "club", audienceMembershipIds: [],
      rotaryYearIds: Array.from({ length: 6 }, (_, index) => `64000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`),
    })).toThrow();
    expect(() => parseCreateJoyPostBody({
      postType: "memory", title: null, content: "職務回憶", visibilityScope: "club", audienceMembershipIds: [],
      roleKeys: ["president", "president"],
    })).toThrow();
    expect(() => parseCreateJoyPostBody({
      postType: "memory", title: null, content: "生日祝福", visibilityScope: "club", audienceMembershipIds: [],
      birthdayCampaignIds: ["not-a-uuid"],
    })).toThrow();
    expect(() => parseCreateJoyPostBody({
      postType: "memory", title: null, content: "無效職務", visibilityScope: "club", audienceMembershipIds: [],
      roleKeys: ["platform admin"],
    })).toThrow();
    expect(() => parseCreateJoyPostBody({
      postType: "blessing", title: null, content: "祝福", visibilityScope: "private", audienceMembershipIds: [],
    })).toThrow();
    expect(() => parseCreateJoyPostBody({
      postType: "blessing", title: null, content: "祝福", visibilityScope: "selected", audienceMembershipIds: [],
    })).toThrow();
  });

  it("rejects duplicate targets, extra fields, invalid types, and content outside limits", () => {
    expect(() => parseCreateJoyPostBody({
      postType: "blessing", title: null, content: "祝福", visibilityScope: "selected",
      audienceMembershipIds: [memberOne, memberOne],
    })).toThrow();
    expect(() => parseCreateJoyPostBody({
      postType: "birthday", title: null, content: "祝福", visibilityScope: "club", audienceMembershipIds: [],
    })).toThrow();
    expect(() => parseCreateJoyPostBody({
      postType: "other", title: null, content: "分享", visibilityScope: "club", audienceMembershipIds: [], clubId: "spoofed",
    })).toThrow();
    expect(() => parseCreateJoyPostBody({
      postType: "other", title: null, content: "字".repeat(2001), visibilityScope: "club", audienceMembershipIds: [],
    })).toThrow();
    expect(() => parseUpdateJoyPostBody({ postType: "question", title: "", content: "ok", visibilityScope: "private" })).toThrow();
    expect(parseUpdateJoyPostBody({ postType: "question", title: "", content: "ok", interactionDeadlineOn: null }))
      .toMatchObject({ postType: "question", interactionDeadlineOn: null });
    expect(() => parseUpdateJoyPostBody({
      postType: "question", title: "", content: "ok", interactionDeadlineOn: "2026-02-30",
    })).toThrow();
  });

  it("normalizes UUIDs and bounds list requests", () => {
    expect(parseJoyClubId("54000000-0000-4000-8000-000000000001")).toBe("54000000-0000-4000-8000-000000000001");
    expect(parseJoyLimit(null)).toBe(20);
    expect(parseJoyLimit("50")).toBe(50);
    expect(() => parseJoyLimit("51")).toThrow();
  });

  it("accepts only an exact same-club member block toggle", () => {
    expect(parseJoyMemberBlockBody({ membershipId: memberOne, blocked: true }))
      .toEqual({ membershipId: memberOne, blocked: true });
    expect(parseJoyMemberBlockBody({ membershipId: memberOne, blocked: false }))
      .toEqual({ membershipId: memberOne, blocked: false });
    expect(() => parseJoyMemberBlockBody({ membershipId: memberOne, blocked: "true" })).toThrow();
    expect(() => parseJoyMemberBlockBody({ membershipId: memberOne, blocked: true, clubId: "spoofed" })).toThrow();
    expect(() => parseJoyMemberBlockBody({ membershipId: "not-a-uuid", blocked: true })).toThrow();
  });

  it("requires a same-club recipient payload and a valid date for non-cash IOUs", () => {
    expect(parseCreateJoyIouBody({
      recipientMembershipId: memberOne, title: "活動協助", content: "我會幫忙整理場地", dueOn: "2026-10-15",
    })).toMatchObject({ recipientMembershipId: memberOne, dueOn: "2026-10-15" });
    expect(() => parseCreateJoyIouBody({
      recipientMembershipId: memberOne, title: null, content: "承諾", dueOn: "2026-02-30",
    })).toThrow();
    expect(() => parseCreateJoyPostBody({
      postType: "iou", title: null, content: "承諾", visibilityScope: "private", audienceMembershipIds: [memberOne],
    })).toThrow();
  });

  it("accepts only documented IOU lifecycle actions and bounded notes", () => {
    expect(parseJoyIouActionBody({ action: "confirm_completion", note: "已交付" }))
      .toEqual({ action: "confirm_completion", note: "已交付" });
    expect(() => parseJoyIouActionBody({ action: "cancel", note: "x".repeat(501) })).toThrow();
    expect(() => parseJoyIouActionBody({ action: "delete", note: null })).toThrow();
  });

  it("accepts only the documented response, reaction, and moderation vocabulary", () => {
    expect(parseJoyReactionBody({ reactionType: "thanks" })).toBe("thanks");
    expect(() => parseJoyReactionBody({ reactionType: "angry" })).toThrow();
    expect(parseJoyReportBody({ reason: "privacy" })).toBe("privacy");
    expect(parseJoyReportBody({ reason: "recipient_hide_request" })).toBe("recipient_hide_request");
    expect(parseJoyModerationBody({ action: "hide", reviewerNote: "已確認" })).toEqual({ action: "hide", reviewerNote: "已確認" });
    expect(() => parseJoyModerationBody({ action: "delete", reviewerNote: null })).toThrow();
    expect(parseJoyFavoriteBody({ isFavorite: true })).toBe(true);
    expect(parseJoyFavoriteBody({ isFavorite: false })).toBe(false);
    expect(() => parseJoyFavoriteBody({ isFavorite: true, actorId: memberOne })).toThrow();
    expect(parseJoyPinBody({ isPinned: true })).toBe(true);
    expect(parseJoyPinBody({ isPinned: false })).toBe(false);
    expect(() => parseJoyPinBody({ isPinned: true, actorId: memberOne })).toThrow();
  });

  it("validates draft inputs while allowing incomplete audience selection and blank content", () => {
    const draftId = "64000000-0000-4000-8000-000000000011";
    expect(parseJoyPostDraftBody({
      draftId, postType: "blessing", title: "", content: "", visibilityScope: "selected",
      audienceMembershipIds: [], eventIds: [], rotaryYearIds: [], roleKeys: [], birthdayCampaignIds: [],
      interactionDeadlineOn: "2026-11-30",
    })).toMatchObject({ draftId, content: "", audienceMembershipIds: [], interactionDeadlineOn: "2026-11-30" });
    expect(() => parseJoyPostDraftBody({
      draftId, postType: "blessing", title: "", content: "", visibilityScope: "club",
      audienceMembershipIds: [], eventIds: [], rotaryYearIds: [], roleKeys: [], birthdayCampaignIds: [],
      interactionDeadlineOn: "2026-02-30",
    })).toThrow("invalid_body");
    expect(() => parseJoyPostDraftBody({
      draftId, postType: "iou", title: null, content: "承諾", visibilityScope: "private",
      audienceMembershipIds: [], eventIds: [], rotaryYearIds: [], roleKeys: [], birthdayCampaignIds: [],
    })).toThrow("invalid_body");
    expect(() => parseJoyPostDraftBody({
      draftId, postType: "blessing", title: null, content: "內容", visibilityScope: "club",
      audienceMembershipIds: ["64000000-0000-4000-8000-000000000012"],
      eventIds: [], rotaryYearIds: [], roleKeys: [], birthdayCampaignIds: [],
    })).toThrow("invalid_body");
    expect(() => parseJoyPostDraftBody({
      draftId, postType: "blessing", title: null, content: "內容", visibilityScope: "private",
      audienceMembershipIds: ["64000000-0000-4000-8000-000000000012", "64000000-0000-4000-8000-000000000013"],
      eventIds: [], rotaryYearIds: [], roleKeys: [], birthdayCampaignIds: [],
    })).toThrow("invalid_body");
  });

  it("accepts only bounded anonymous suggestion text and review actions", () => {
    expect(parseCreateJoySuggestionBody({ content: "  希望增加服務活動回顧。  " }))
      .toEqual({ content: "希望增加服務活動回顧。" });
    expect(() => parseCreateJoySuggestionBody({ content: "x".repeat(1001) })).toThrow();
    expect(() => parseCreateJoySuggestionBody({ content: "內容", authorId: memberOne })).toThrow();
    expect(parseJoySuggestionReviewBody({ action: "reviewed" })).toEqual({ action: "reviewed" });
    expect(parseJoySuggestionReviewBody({ action: "dismissed" })).toEqual({ action: "dismissed" });
    expect(() => parseJoySuggestionReviewBody({ action: "delete" })).toThrow();
    expect(parseJoySuggestionId("64000000-0000-4000-8000-000000000009"))
      .toBe("64000000-0000-4000-8000-000000000009");
  });

  it("validates club prompt edits and distinct, bounded batch recipients", () => {
    const requestId = "64000000-0000-4000-8000-000000000003";
    expect(parseCreateJoyQuestionPromptBody({ promptText: "最近哪件事讓你很感謝？" }))
      .toEqual({ promptText: "最近哪件事讓你很感謝？" });
    expect(parseUpdateJoyQuestionPromptBody({ promptText: "最近哪件事讓你很感謝？", isActive: false, sortOrder: 20 }))
      .toMatchObject({ isActive: false, sortOrder: 20 });
    expect(() => parseUpdateJoyQuestionPromptBody({ promptText: "太短", isActive: true, sortOrder: 20 })).toThrow();
    expect(parseJoyQuestionBatchBody({
      title: "十月社員提問", recipientMembershipIds: [memberOne], requestId,
    })).toMatchObject({ title: "十月社員提問", recipientMembershipIds: [memberOne], requestId, dueOn: null });
    expect(parseJoyQuestionBatchBody({
      title: "十月社員提問", recipientMembershipIds: [memberOne], requestId, dueOn: "2026-10-31",
    })).toMatchObject({ dueOn: "2026-10-31" });
    expect(() => parseJoyQuestionBatchBody({
      title: "十月社員提問", recipientMembershipIds: [memberOne, memberOne], requestId,
    })).toThrow();
    expect(() => parseJoyQuestionBatchBody({
      title: "十月社員提問", recipientMembershipIds: [], requestId,
    })).toThrow();
    expect(() => parseJoyQuestionBatchBody({
      title: "十月社員提問", recipientMembershipIds: [memberOne], requestId, dueOn: "2026-02-30",
    })).toThrow();
    expect(() => parseJoyQuestionBatchBody({
      title: "十月社員提問", recipientMembershipIds: [memberOne], requestId, dueOn: "2026-10-31T23:59:59Z",
    })).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { parseBirthdayCollectionPageProjection } from "./collection-contracts";

const ids = {
  club: "44000000-0000-4000-8000-000000000001",
  participant: "54000000-0000-4000-8000-000000000001",
  campaign: "64000000-0000-4000-8000-000000000001",
  membership: "74000000-0000-4000-8000-000000000001",
  question: "84000000-0000-4000-8000-000000000001",
};

function projection() {
  return {
    club_id: ids.club,
    can_manage: true,
    my_assignments: [{
      participant_id: ids.participant,
      campaign_id: ids.campaign,
      recipient_membership_id: ids.membership,
      recipient_name: "壽星",
      birthday_date: "2026-08-20",
      participant_status: "invited",
      question_prompt: "壽星哪一個小習慣最讓你會心一笑？",
      submission_id: null,
      submission_status: null,
      content: null,
      submitted_at: null,
      can_edit: true,
      can_decline: true,
    }],
    campaigns: [{
      campaign_id: ids.campaign,
      recipient_membership_id: ids.membership,
      recipient_name: "壽星",
      birthday_year: 2026,
      birthday_date: "2026-08-20",
      campaign_status: "collecting",
      participant_count: 1,
      submitted_count: 0,
    }],
    participants: [{
      participant_id: ids.participant,
      campaign_id: ids.campaign,
      assignee_membership_id: ids.membership,
      assignee_name: "社員",
      participant_status: "invited",
      question_prompt: "壽星哪一個小習慣最讓你會心一笑？",
      submission_status: null,
      author_name: null,
      content: null,
      submitted_at: null,
      processing_history: [],
    }],
    published_wishes: [{
      submission_id: ids.participant,
      campaign_id: ids.campaign,
      recipient_membership_id: ids.membership,
      recipient_name: "壽星",
      birthday_date: "2026-08-20",
      content: "已發布的祝福",
      published_at: "2026-08-01T00:00:00.000Z",
      author_name: null,
      author_is_hidden: true,
    }],
    question_bank: {
      platform: [{
        id: ids.question,
        question_key: "birthday_q_001",
        prompt: "你最想謝謝壽星曾經做過哪一件小事？",
        tone: "warm",
        sort_order: 1,
        is_enabled: true,
        scope: "platform",
      }],
      club: [],
    },
  };
}

describe("birthday collection projection", () => {
  it("parses member and management projections without exposing assumptions", () => {
    expect(parseBirthdayCollectionPageProjection(projection())).toMatchObject({
      clubId: ids.club,
      canManage: true,
      myAssignments: [{ recipientName: "壽星", canEdit: true }],
      campaigns: [{ campaignStatus: "collecting", participantCount: 1 }],
      participants: [{ authorName: null, processingHistory: [] }],
      publishedWishes: [{ authorIsHidden: true, authorName: null }],
    });
  });

  it("rejects an invalid scope or author shape instead of rendering it", () => {
    const invalid = projection();
    invalid.question_bank.platform[0].scope = "club";
    expect(() => parseBirthdayCollectionPageProjection(invalid)).toThrow("invalid_birthday_collection_projection");

    const invalidAuthor = projection();
    (invalidAuthor.participants[0] as { author_name: unknown }).author_name = 123;
    expect(() => parseBirthdayCollectionPageProjection(invalidAuthor)).toThrow("invalid_birthday_collection_projection");
  });

  it("rejects database values outside the birthday campaign contract", () => {
    const invalidYear = projection();
    invalidYear.campaigns[0].birthday_year = 1999;
    expect(() => parseBirthdayCollectionPageProjection(invalidYear)).toThrow("invalid_birthday_collection_projection");

    const invalidCounts = projection();
    invalidCounts.campaigns[0].submitted_count = 2;
    expect(() => parseBirthdayCollectionPageProjection(invalidCounts)).toThrow("invalid_birthday_collection_projection");
  });
});

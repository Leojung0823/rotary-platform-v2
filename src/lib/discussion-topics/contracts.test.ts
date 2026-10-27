import { describe, expect, it } from "vitest";
import {
  parseDiscussionTopicDetail,
  parseDiscussionTopicEditData,
  parseDiscussionTopicList,
  parseDiscussionVoteResult,
} from "./contracts";
import { parseDiscussionOptions, parseTaipeiDateTimeLocal } from "./validation";

const clubId = "a1000000-0000-4000-8000-000000000001";
const topicId = "b2000000-0000-4000-8000-000000000001";
const optionId = "c3000000-0000-4000-8000-000000000001";

function summary(overrides: Record<string, unknown> = {}) {
  return {
    id: topicId, club_id: clubId, title: "服務方向討論", description: "請社員分享想法。",
    deadline_at: "2026-10-29T04:00:00.000Z", audience_kind: "all", anonymous_votes: true,
    created_at: "2026-10-27T04:00:00.000Z", is_open: true, vote_count: 0, comment_count: 0,
    has_voted: false, ...overrides,
  };
}

describe("議題討論資料契約", () => {
  it("拒絕跨社或不完整清單", () => {
    expect(parseDiscussionTopicList({ club_id: clubId, topics: [summary()] }, clubId)).toHaveLength(1);
    expect(() => parseDiscussionTopicList({ club_id: "a1000000-0000-4000-8000-000000000002", topics: [summary()] }, clubId))
      .toThrow("invalid_discussion_topic_list");
  });
  it("接受具名投票的明確管理投影", () => {
    const detail = parseDiscussionTopicDetail({
      ...summary({ anonymous_votes: false, audience_count: 12, audience_tags: [] }),
      my_vote_option_id: optionId,
      options: [
        { id: optionId, label: "擴大服務", vote_count: 1 },
        { id: "c3000000-0000-4000-8000-000000000002", label: "維持現況", vote_count: 0 },
      ],
      comments: [{ id: "d4000000-0000-4000-8000-000000000001", body: "支持。", author_display_name: "社員甲", created_at: "2026-10-27T05:00:00.000Z" }],
      named_votes: [{ membership_id: "e5000000-0000-4000-8000-000000000001", display_name: "社員甲", option_id: optionId, option_text: "擴大服務" }],
    }, clubId, topicId);
    expect(detail).toMatchObject({ anonymousVotes: false, myVoteOptionId: optionId, namedVotes: [{ displayName: "社員甲" }] });
  });
  it("拒絕錯誤的具名投票身分", () => {
    expect(() => parseDiscussionTopicDetail({
      ...summary(), my_vote_option_id: null,
      options: [
        { id: optionId, label: "A", vote_count: 0 },
        { id: "c3000000-0000-4000-8000-000000000002", label: "B", vote_count: 0 },
      ],
      comments: [], named_votes: [{ display_name: "不完整" }],
    }, clubId, topicId)).toThrow("invalid_discussion_topic_detail");
  });
  it("接受僅供幹部使用的編輯資料並驗證社團與選項", () => {
    const edit = parseDiscussionTopicEditData({
      id: topicId, club_id: clubId, title: "服務方向討論", description: "說明",
      deadline_at: "2026-10-29T04:00:00.000Z", audience_kind: "tags", anonymous_votes: false,
      options: [{ id: optionId, label: "擴大服務" }, { id: "c3000000-0000-4000-8000-000000000002", label: "維持現況" }],
      audience_tag_ids: ["d4000000-0000-4000-8000-000000000001"], audience_membership_ids: [],
      vote_count: 1, comment_count: 0,
    }, clubId, topicId);
    expect(edit).toMatchObject({ audienceKind: "tags", anonymousVotes: false, voteCount: 1 });
    expect(() => parseDiscussionTopicEditData({
      id: topicId, club_id: "a1000000-0000-4000-8000-000000000002",
    }, clubId, topicId)).toThrow("invalid_discussion_topic_edit_data");
  });
  it("驗證投票只回傳本人選擇與聚合票數，不接受跨社、缺漏或不一致資料", () => {
    const otherOptionId = "c3000000-0000-4000-8000-000000000002";
    const result = parseDiscussionVoteResult({
      topic_id: topicId, club_id: clubId, my_vote_option_id: optionId, vote_count: 2,
      options: [{ id: optionId, vote_count: 1 }, { id: otherOptionId, vote_count: 1 }],
    }, clubId, topicId);
    expect(result).toMatchObject({ myVoteOptionId: optionId, voteCount: 2 });
    expect(() => parseDiscussionVoteResult({
      topic_id: topicId, club_id: clubId, my_vote_option_id: optionId, vote_count: 2,
      options: [{ id: optionId, vote_count: 0 }, { id: otherOptionId, vote_count: 0 }],
      named_votes: [{ membership_id: "must-not-be-returned" }],
    }, clubId, topicId)).toThrow("invalid_discussion_vote_result");
  });
  it("驗證選項並把台北 datetime-local 轉成正確時刻", () => {
    expect(parseDiscussionOptions("同意\n不同意")).toEqual(["同意", "不同意"]);
    expect(() => parseDiscussionOptions("同意\n 同意 ")).toThrow("invalid_discussion_options");
    expect(parseTaipeiDateTimeLocal("2026-10-29T12:00")).toBe("2026-10-29T04:00:00.000Z");
    expect(() => parseTaipeiDateTimeLocal("2026-02-31T12:00")).toThrow("invalid_discussion_deadline");
  });
});

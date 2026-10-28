import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), requireIdentity: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireIdentity: mocks.requireIdentity }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { castDiscussionVoteAction } from "./discussion-topic-actions";

const clubId = "a1000000-0000-4000-8000-000000000001";
const topicId = "b2000000-0000-4000-8000-000000000001";
const optionId = "c3000000-0000-4000-8000-000000000001";
const memberId = "e5000000-0000-4000-8000-000000000001";
const vote = {
  topic_id: topicId, club_id: clubId, my_vote_option_id: optionId, vote_count: 1,
  options: [{ id: optionId, vote_count: 1 }, { id: "c3000000-0000-4000-8000-000000000002", vote_count: 0 }],
};
const detail = {
  id: topicId, club_id: clubId, title: "議題名稱", description: "說明", deadline_at: "2026-10-29T04:00:00Z",
  audience_kind: "all", anonymous_votes: true, created_at: "2026-10-27T04:00:00Z", is_open: true,
  vote_count: 1, comment_count: 0, my_vote_option_id: optionId,
  options: [{ id: optionId, label: "同意", vote_count: 1 }, { id: "c3000000-0000-4000-8000-000000000002", label: "不同意", vote_count: 0 }],
  comments: [], named_votes: [], voters: [{ membership_id: memberId, display_name: "社員甲" }],
};
function form() {
  const data = new FormData();
  data.set("clubId", clubId); data.set("topicId", topicId); data.set("optionId", optionId);
  return data;
}

describe("discussion vote acknowledgement", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.requireIdentity.mockResolvedValue({ id: memberId }); });

  it("returns the authorized participant list after the vote is confirmed", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "cast_club_discussion_vote"
      ? { data: vote, error: null } : { data: detail, error: null });
    const result = await castDiscussionVoteAction(form());
    expect(result).toMatchObject({ ok: true, voters: [{ membershipId: memberId, displayName: "社員甲" }] });
    expect(mocks.rpc).toHaveBeenCalledWith("get_my_club_discussion_topic", { p_club_id: clubId, p_topic_id: topicId });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/topics/${topicId}`);
  });

  it("does not report a confirmed vote as failed if refreshing the list fails", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "cast_club_discussion_vote") return { data: vote, error: null };
      throw new Error("temporary read failure");
    });
    expect(await castDiscussionVoteAction(form())).toMatchObject({ ok: true, voters: null });
  });
});

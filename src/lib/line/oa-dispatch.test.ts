import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTrustedAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createTrustedAdminClient: mocks.createTrustedAdminClient,
}));

import { buildPushLogArgs, loadClubOaDispatchContext } from "./oa-dispatch";

function queryResult(result: unknown) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

describe("LINE OA dispatch logging", () => {
  it("keeps a partial delivery visible even though the status column cannot say so", () => {
    const args = buildPushLogArgs("club-id", "multicast", 501, "測試訊息", {
      status: "failed",
      failureCode: "rate_limited",
      retryAfterSeconds: 30,
      batchCount: 2,
      sentBatchCount: 1,
      deliveredRecipientCount: 500,
    });

    expect(args).toMatchObject({
      p_delivery_status: "failed",
      p_failure_code: "rate_limited",
      p_recipient_count: 501,
    });
    expect(args.p_payload_summary).toMatchObject({
      batch_count: 2,
      sent_batch_count: 1,
      delivered_recipient_count: 500,
      character_count: 4,
    });
  });

  it("records no failure code for a delivery that succeeded", () => {
    const args = buildPushLogArgs("club-id", "broadcast", 0, "測試", {
      status: "sent",
      requestId: "req-1",
      batchCount: 1,
      sentBatchCount: 1,
      deliveredRecipientCount: 0,
    });
    expect(args.p_failure_code).toBeNull();
    expect(args.p_provider_request_id).toBe("req-1");
  });

  it("falls back to a generic failure code rather than reporting a success", () => {
    const args = buildPushLogArgs("club-id", "broadcast", 0, "測試", {
      status: "failed",
      batchCount: 0,
      sentBatchCount: 0,
      deliveredRecipientCount: 0,
    });
    expect(args.p_failure_code).toBe("provider_error");
  });
});

describe("LINE OA dispatch boundary", () => {
  const callSites = ["src/app/line-oa-actions.ts", "src/app/api/v1/[...path]/route.ts"];

  it("routes every club push through the shared dispatch module", () => {
    for (const file of callSites) {
      const source = readFileSync(file, "utf8");
      // Two independent copies of this flow drifted before; the audience-aware
      // one targeted a tag while the other silently sent to every follower.
      expect(source).toContain("loadClubOaDispatchContext");
      expect(source).toContain("buildPushLogArgs");
      expect(source).not.toContain("sendLineOaMessage");
      expect(source).not.toContain("readServerSecret");
    }
  });

  it("only exposes followers paired to active memberships", async () => {
    const account = queryResult({ data: { access_token_env_key: "TEST_TOKEN" }, error: null });
    const memberships = queryResult({
      data: [{ person_id: "active-person" }],
      error: null,
    });
    const followers = queryResult({
      data: [
        { oa_user_id: "Uactive", person_id: "active-person" },
        { oa_user_id: "Uended", person_id: "ended-person" },
        { oa_user_id: "Uunpaired", person_id: null },
      ],
      error: null,
    });
    const admin = {
      from: vi.fn((table: string) => ({
        "line_oa_accounts": account,
        "club_memberships": memberships,
        "line_oa_followers": followers,
      }[table])),
    };
    mocks.createTrustedAdminClient.mockReturnValue(admin);

    const result = await loadClubOaDispatchContext("club-id");

    expect(result).toEqual({
      ok: true,
      context: { accessToken: undefined, followers: ["Uactive"] },
    });
    expect(admin.from).toHaveBeenCalledWith("club_memberships");
    expect(memberships.eq).toHaveBeenCalledWith("membership_status", "active");
    expect(followers.eq).toHaveBeenCalledWith("follower_status", "following");
  });
});

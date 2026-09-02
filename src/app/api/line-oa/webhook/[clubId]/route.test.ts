import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminFrom: vi.fn(),
  adminRpc: vi.fn(),
  createTrustedAdminClient: vi.fn(),
  followerUpsert: vi.fn(),
  readServerSecret: vi.fn(),
  verifyLineWebhookSignature: vi.fn(),
}));

vi.mock("@/lib/line/messaging", () => ({
  verifyLineWebhookSignature: mocks.verifyLineWebhookSignature,
}));
vi.mock("@/lib/line/oa-runtime", () => ({
  readServerSecret: mocks.readServerSecret,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createTrustedAdminClient: mocks.createTrustedAdminClient,
}));

import * as route from "./route";

const clubId = "42000000-0000-4000-8000-000000000001";
const accountId = "52000000-0000-4000-8000-000000000001";
const oaUserId = "Uwebhook-pairing-test";

function query(result: unknown) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    neq: vi.fn(),
    maybeSingle: vi.fn(async () => result),
    update: vi.fn(),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.neq.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  return chain;
}

function request(events = [{
  type: "follow",
  webhookEventId: "evt-follow-pairing-1",
  source: { userId: oaUserId },
  timestamp: 1_756_800_000_000,
}]) {
  return new NextRequest(`http://localhost:3000/api/line-oa/webhook/${clubId}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-line-signature": "valid-signature",
    },
    body: JSON.stringify({ events }),
  });
}

function params() {
  return { params: Promise.resolve({ clubId }) };
}

describe("POST /api/line-oa/webhook/[clubId]", () => {
  let followerResult: { data: unknown; error: unknown };
  let pairingResult: { data: unknown; error: unknown };
  let pairingThrows: boolean;
  let webhookUpdate: Record<string, unknown> | null;

  beforeEach(() => {
    vi.stubEnv("APP_ENV", "local");
    followerResult = { data: [], error: null };
    pairingResult = { data: "paired", error: null };
    pairingThrows = false;
    webhookUpdate = null;

    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.verifyLineWebhookSignature.mockReturnValue(true);
    mocks.readServerSecret.mockReturnValue("webhook-secret");
    mocks.followerUpsert.mockImplementation(async () => followerResult);
    mocks.adminRpc.mockImplementation(async (name: string) => {
      if (name === "consume_line_webhook_rate_limit") return { data: true, error: null };
      if (name === "claim_line_webhook_event") {
        return { data: { log_id: 901, should_process: true }, error: null };
      }
      if (name === "auto_pair_line_oa_follower") {
        if (pairingThrows) throw new Error("private pairing detail");
        return pairingResult;
      }
      throw new Error(`unexpected RPC ${name}`);
    });

    mocks.adminFrom.mockImplementation((table: string) => {
      if (table === "line_oa_accounts") {
        return query({
          data: { id: accountId, webhook_secret_env_key: "LINE_OA_TEST_SECRET" },
          error: null,
        });
      }
      if (table === "line_oa_followers") return { upsert: mocks.followerUpsert };
      if (table === "line_webhooks") {
        const chain = query({ data: null, error: null });
        chain.update.mockImplementation((values: Record<string, unknown>) => {
          webhookUpdate = values;
          return chain;
        });
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    });

    mocks.createTrustedAdminClient.mockReturnValue({
      from: mocks.adminFrom,
      rpc: mocks.adminRpc,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("pairs only after the follower's row has been created", async () => {
    const response = await route.POST(request(), params());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.followerUpsert).toHaveBeenCalledWith(expect.objectContaining({
      line_oa_account_id: accountId,
      club_id: clubId,
      oa_user_id: oaUserId,
      follower_status: "following",
    }), { onConflict: "line_oa_account_id,oa_user_id" });
    expect(mocks.adminRpc).toHaveBeenCalledWith("auto_pair_line_oa_follower", {
      p_line_oa_account_id: accountId,
      p_club_id: clubId,
      p_oa_user_id: oaUserId,
    });
    expect(mocks.followerUpsert.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.adminRpc.mock.invocationCallOrder[2]);
    expect(webhookUpdate).toMatchObject({
      processing_status: "processed",
      failure_code: null,
    });
  });

  it("does not call pairing when follower persistence fails", async () => {
    followerResult = { data: null, error: { message: "private database detail" } };

    const response = await route.POST(request(), params());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "webhook_processing_failed" });
    expect(mocks.adminRpc).not.toHaveBeenCalledWith("auto_pair_line_oa_follower", expect.anything());
    expect(webhookUpdate).toEqual({
      processing_status: "failed",
      failure_code: "follower_upsert_failed",
    });
  });

  it("records a pairing RPC error without retrying the completed webhook", async () => {
    pairingResult = { data: null, error: { message: "private pairing detail" } };

    const response = await route.POST(request(), params());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(JSON.stringify(body)).not.toContain(oaUserId);
    expect(webhookUpdate).toMatchObject({
      processing_status: "processed",
      failure_code: "auto_pairing_failed",
    });
  });

  it("contains a thrown pairing failure after the follower row is durable", async () => {
    pairingThrows = true;

    const response = await route.POST(request(), params());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(webhookUpdate).toMatchObject({
      processing_status: "processed",
      failure_code: "auto_pairing_failed",
    });
  });
});

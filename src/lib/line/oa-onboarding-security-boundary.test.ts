import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260902000500_line_oa_member_onboarding.sql",
  "utf8",
);
const statusRoute = readFileSync(
  "src/app/api/line-oa/onboarding/status/route.ts",
  "utf8",
);
const client = readFileSync("src/components/line-oa-onboarding.tsx", "utf8");

describe("LINE OA onboarding security boundary", () => {
  it("keeps the member projection caller-only and the verification write service-only", () => {
    expect(migration).toContain(
      "revoke all on function public.get_my_line_oa_onboarding_status(uuid) from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function public.get_my_line_oa_onboarding_status(uuid) to authenticated;",
    );
    expect(migration).toMatch(
      /revoke all on function public\.record_line_oa_account_identity_verification[\s\S]+?from public, anon, authenticated;/u,
    );
    expect(migration).toMatch(
      /grant execute on function public\.record_line_oa_account_identity_verification[\s\S]+?to service_role;/u,
    );
  });

  it("does not expose LINE identifiers or credentials through the status endpoint", () => {
    expect(statusRoute).toContain('"cache-control": "no-store"');
    expect(statusRoute).toContain('"referrer-policy": "no-referrer"');
    for (const forbidden of ["oaUserId", "providerSubject", "channelId", "linkToken", "nonce"]) {
      expect(statusRoute).not.toContain(forbidden);
    }
  });

  it("rechecks status after LINE returns and never turns a click into success", () => {
    expect(client).toContain('window.addEventListener("pageshow"');
    expect(client).toContain('document.addEventListener("visibilitychange"');
    expect(client).toContain("remaining = 6");
    expect(client).toContain("setTimeout(tick, 3_000)");
    expect(client.match(/setPhase\("connected"\)/gu)).toHaveLength(1);
  });

  it("never lets the browser mutate follower or identity tables", () => {
    expect(client).not.toMatch(/from\(["']line_(?:oa_followers|identities)["']\)/u);
    expect(client).not.toContain("pair_line_oa_follower");
  });
});

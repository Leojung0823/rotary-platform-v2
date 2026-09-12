import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260913000100_club_join_link.sql", "utf8");
const callback = readFileSync("src/app/api/auth/line/callback/route.ts", "utf8");
const start = readFileSync("src/app/api/auth/line/start/route.ts", "utf8");
const landing = readFileSync("src/app/join-club/page.tsx", "utf8");

describe("club join link boundaries", () => {
  it("keeps redemption off every browser role", () => {
    expect(migration).toContain(
      "revoke all on function public.redeem_club_join_link_trusted(text, uuid, text, text, text, text)\n  from public, anon, authenticated;",
    );
    expect(migration).toContain("to service_role;");
  });

  it("stores only a hash of the token", () => {
    expect(migration).toContain("token_hash text not null unique check (length(token_hash) = 64)");
    expect(migration).toContain("encode(extensions.digest(raw_token, 'sha256'), 'hex')");
  });

  it("allows only one live link per club so a leaked token cannot linger", () => {
    expect(migration).toContain("create unique index club_join_links_one_active_per_club");
    expect(migration).toContain("where link_status = 'active'");
  });

  it("refuses a link that is not active and gates the whole feature on the flag", () => {
    expect(migration).toContain("club_join_link_unavailable");
    expect(migration).toContain("if not public.club_join_link_enabled() then");
  });

  it("registers the rollback key with the protected flag RPC", () => {
    // A key the flag RPC does not know cannot be switched off through the
    // audited CLI, which would leave this feature with no kill switch.
    expect(migration).toContain("'line_oa_flex_templates_v1', 'club_join_link_v1'");
  });
});

describe("join link login flow", () => {
  it("never lets one round trip carry both an invitation and a join link", () => {
    expect(start).toContain("LINE Login cannot carry both an invitation and a join link.");
  });

  it("requires the token-carrying flows to actually present a token", () => {
    expect(callback).toContain('const flowCarriesToken = flow === "invitation" || flow === "join_link";');
    expect(callback).toContain("if (flowCarriesToken !== Boolean(invitationToken))");
  });

  it("signs in a returning LINE subject instead of creating a second person", () => {
    const branch = callback.slice(callback.indexOf('if (flow === "join_link")'));
    expect(branch).toContain('.eq("provider_subject", profile.subject)');
    expect(branch).toContain('.eq("identity_status", "active")');
    expect(branch.indexOf("knownIdentity.data"))
      .toBeLessThan(branch.indexOf("admin.auth.admin.createUser"));
  });

  it("fails closed rather than re-attaching an unbound account through an open link", () => {
    const branch = callback.slice(callback.indexOf('if (flow === "join_link")'));
    const createIndex = branch.indexOf("admin.auth.admin.createUser");
    const redeemIndex = branch.indexOf("redeem_club_join_link_trusted");
    expect(branch.slice(createIndex, redeemIndex)).toContain("LINE Login Auth user creation failed.");
    expect(branch.slice(createIndex, redeemIndex)).not.toContain("generateLink");
  });
});

describe("join link landing page", () => {
  it("tells the visitor what joining exposes before they log in", () => {
    expect(landing).toContain("社員名錄");
  });

  it("gives a bad token and a closed link the same answer", () => {
    expect(landing).toContain("這個加入連結不存在，或已經被扶輪社關閉。");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const callback = readFileSync("src/app/api/auth/line/callback/route.ts", "utf8");
const card = readFileSync("src/components/line-oa-onboarding.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20260907000100_line_oa_pair_after_bind.sql", "utf8");

describe("LINE bind returns to where it started", () => {
  it("no longer discards the validated return path on a successful bind", () => {
    const bindBlock = callback.slice(
      callback.indexOf('if (flow === "bind") {', callback.indexOf("exchangeLineCode")),
    );
    const redirect = bindBlock.slice(0, bindBlock.indexOf("clearLineOAuthCookies") + 400);
    // A bind started from the onboarding card used to land on /me.
    expect(redirect).toContain("withSuccess(returnTo,");
    expect(redirect).not.toContain('"/me?success=line_bound"');
  });

  it("keeps the return path relative and preserves an existing query", () => {
    expect(callback).toContain("function withSuccess(");
    const helper = callback.slice(callback.indexOf("function withSuccess("));
    expect(helper).toContain('includes("?") ? "&" : "?"');
    // Anything absolute would be a redirect out of the platform.
    expect(helper).not.toContain("new URL(");
  });
});

describe("pairing retried after a bind", () => {
  it("runs the retry from the callback without letting it undo the bind", () => {
    const bindBlock = callback.slice(callback.indexOf('bind_line_identity_to_existing_account_trusted'));
    const retryIndex = bindBlock.indexOf("pair_line_oa_followers_for_subject");
    expect(retryIndex).toBeGreaterThan(-1);
    // The binding already succeeded by this point; a retry failure is logged,
    // never thrown, or the member would be told the bind failed when it did not.
    const retryBlock = bindBlock.slice(retryIndex, retryIndex + 400);
    expect(retryBlock).not.toContain("throw new Error");
    expect(retryBlock).toContain("console.error");
  });

  it("derives everything from the subject and is service-role only", () => {
    // The callback has no end-user session to authorise against, so the RPC
    // must not accept a club or person from its caller.
    expect(migration).toContain("p_provider_subject text");
    expect(migration).not.toMatch(/p_club_id|p_person_id/u);
    expect(migration).toMatch(
      /revoke all on function public\.pair_line_oa_followers_for_subject\(text\)[\s\S]+?from public, anon, authenticated;/u,
    );
    expect(migration).toMatch(
      /grant execute on function public\.pair_line_oa_followers_for_subject\(text\) to service_role;/u,
    );
  });

  it("reuses the exact-match pairing RPC rather than writing its own", () => {
    // auto_pair_line_oa_follower re-checks the flag, the membership and the
    // existing pairing; duplicating that logic here would be a second place to
    // get the identity match wrong.
    expect(migration).toContain("public.auto_pair_line_oa_follower(");
    expect(migration).not.toContain("update public.line_oa_followers");
  });
});

describe("binding before joining", () => {
  it("offers binding first when the member has no LINE identity", () => {
    expect(card).toContain("const needsBinding = !connected && !status.lineLoginBound;");
    expect(card).toContain("flow=bind");
    expect(card).toContain("綁定 LINE 身份");
  });

  it("does not offer the join link to a member who cannot be matched yet", () => {
    // Following without a bound identity produces a follower row nobody can
    // resolve, which is the state that needs an officer to clean up.
    const joinBlock = card.slice(card.indexOf("{!needsBinding && !connected"));
    expect(joinBlock).toContain("status.joinUrl");
    expect(card.indexOf("{needsBinding &&")).toBeLessThan(card.indexOf("{!needsBinding && !connected"));
  });

  it("still says the join step exists when the club account is unverified", () => {
    expect(card).toContain("本社帳號完成安全驗證後開放");
  });
});

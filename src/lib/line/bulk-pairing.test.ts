import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { latestDefinition } from "@/lib/attendance/latest-definition";

const bulk = latestDefinition("pair_unpaired_line_oa_followers");
const migration = readFileSync(
  "supabase/migrations/20260916000800_repair_unpaired_followers.sql",
  "utf8",
);
const actions = readFileSync("src/app/actions.ts", "utf8");
const page = readFileSync("src/app/(authenticated)/clubs/[clubId]/line-oa/page.tsx", "utf8");

describe("one rule for who a follower is", () => {
  // Auto-pairing runs on the follow event, so everyone who added the OA before
  // it was switched on stays unpaired. This clears that backlog -- by asking
  // the same function, not by repeating the match.
  it("delegates to auto-pairing rather than matching again", () => {
    expect(bulk).toContain("public.auto_pair_line_oa_follower(account_id, p_club_id, candidate.oa_user_id)");
    for (const guess of ["provider_subject", "canonical_name", "primary_email", "line_identities"]) {
      expect(bulk, `the bulk run matches on ${guess} itself`).not.toContain(guess);
    }
  });

  it("inherits the feature flag instead of being a quieter door", () => {
    // With auto-pairing off this reports blocked and changes nothing.
    expect(bulk).toContain("elsif outcome = 'disabled' then blocked := true;");
    expect(page).toContain("自動配對目前沒有開啟");
  });
});

describe("it is an officer's action and is recorded as one", () => {
  it("requires oa.manage", () => {
    expect(bulk).toContain("current_has_club_permission(p_club_id, 'oa.manage')");
    expect(bulk).toContain("'42501'");
  });

  it("records who asked for it, unlike the webhook's own rows", () => {
    const audit = bulk.slice(bulk.indexOf("insert into public.audit_logs"));
    expect(audit).toContain("'line_oa.bulk_paired'");
    expect(audit).toContain("actor_id");
    expect(audit).toContain("'paired', paired");
  });

  it("is not executable by anonymous callers", () => {
    expect(migration).toContain(
      "revoke all on function public.pair_unpaired_line_oa_followers(uuid) from public, anon",
    );
    expect(migration).toContain(
      "grant execute on function public.pair_unpaired_line_oa_followers(uuid) to authenticated",
    );
  });

  it("only ever looks at this club's own unpaired followers", () => {
    const loop = bulk.slice(bulk.indexOf("for candidate in"), bulk.indexOf("loop\n"));
    expect(loop).toContain("follower.club_id = p_club_id");
    expect(loop).toContain("follower.line_oa_account_id = account_id");
    expect(loop).toContain("follower.person_id is null");
    expect(loop).toContain("follower.follower_status = 'following'");
  });

  it("is bounded so one press cannot run away", () => {
    expect(bulk).toMatch(/limit 200/u);
  });
});

describe("it says what it did", () => {
  it("returns the counts rather than a bare success", () => {
    for (const field of ["'paired'", "'unmatched'", "'conflicted'", "'blocked'"]) {
      expect(bulk, `the result omits ${field}`).toContain(field);
    }
  });

  it("carries them through to the page", () => {
    const action = actions.slice(actions.indexOf("export async function repairLineOaFollowersAction"));
    expect(action).toContain("success=bulk_paired");
    for (const field of ["paired", "unmatched", "conflicted", "blocked"]) {
      expect(action).toContain(`${field}:`);
    }
  });

  it("tells an officer that an unmatched follower is not a failure", () => {
    // Somebody whose LINE Login is not bound cannot be matched by an id nobody
    // holds. Saying so stops the officer pressing the button again.
    expect(page).toContain("尚未綁定 LINE Login");
  });

  it("does not report a run of zero as though it paired everyone", () => {
    const message = page.slice(page.indexOf("const bulkPairedMessage"), page.indexOf("const bulkPairedMessage") + 1200);
    expect(message).toContain("已配對 ${paired} 位");
    expect(message).toContain("unmatched > 0");
  });
});

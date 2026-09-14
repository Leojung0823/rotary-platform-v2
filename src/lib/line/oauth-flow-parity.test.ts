import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lineOAuthFlows } from "./security";

const callback = readFileSync("src/app/api/auth/line/callback/route.ts", "utf8");
const startRoute = readFileSync("src/app/api/auth/line/start/route.ts", "utf8");
const migrations = readFileSync(
  "supabase/migrations/20260913000100_club_join_link.sql",
  "utf8",
);

describe("LINE OAuth flow parity", () => {
  // join_link shipped able to start a round trip but not to finish one: the
  // callback carried its own hand-written allow-list and nobody added the new
  // flow to it. Every layer that names the set must be driven by, or checked
  // against, the same list.
  it("lets the callback accept every declared flow", () => {
    // parseFlow is module-private, so drive the guarantee through the shared
    // const it now uses: a hand-written literal list would fail this.
    expect(callback).toContain("lineOAuthFlows.find((flow) => flow === value)");
    expect(callback).not.toContain('value === "login" || value === "invitation"');
  });

  it("declares exactly the flows the rest of the system knows about", () => {
    expect([...lineOAuthFlows]).toEqual(["login", "invitation", "join_link", "bind"]);
  });

  it("keeps the database flow_kind constraint in step with the declared flows", () => {
    for (const flow of lineOAuthFlows) {
      expect(migrations).toContain(`flow_kind = '${flow}'`);
    }
  });

  it("starts a join_link round trip only for a join token", () => {
    expect(startRoute).toContain('? "join_link"');
  });
});

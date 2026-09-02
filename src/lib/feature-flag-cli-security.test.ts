import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { featureFlagKeys } from "@/lib/product/feature-flags";

const source = readFileSync("scripts/set-feature-flags.mjs", "utf8");

describe("feature flag CLI security boundary", () => {
  it("reads interactive credentials in raw mode without patching terminal output", () => {
    expect(source).toContain("stdin.setRawMode(true)");
    expect(source).toContain('stdin.setEncoding("utf8")');
    expect(source).toContain('stdin.off("data", onData)');
    expect(source).not.toContain("createInterface");
    expect(source).not.toContain("rl.output._write");
    expect(source).not.toMatch(/console\.log\([\s\S]*password/iu);
  });

  it("uses the protected rollout RPC and never writes the flag table directly", () => {
    expect(source).toContain('client.rpc("set_platform_feature_flag"');
    expect(source).not.toContain('from("platform_feature_flags")');
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("verifies the protected RPC returned the requested rollout state", () => {
    expect(source).toContain("returnedFlag.feature_key !== featureKey");
    expect(source).toContain("returnedFlag.enabled !== enabled");
    expect(source).toContain("returnedFlag.rollout_percentage !== expectedRolloutPercentage");
    expect(source).toContain("returnedFlag.enabled_environments[0] !== target.target");
  });

  it("knows every feature key the application knows", () => {
    // A key added to the union but not here fails only when an operator is
    // already at the password prompt trying to turn the feature on, with the
    // migration long since deployed. Catching it at build time instead.
    const listed = (name: string) => {
      const match = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`, "u"));
      return [...(match?.[1] ?? "").matchAll(/"([a-z0-9_]+)"/gu)].map((entry) => entry[1]);
    };
    const known = new Set([...listed("IMPLEMENTED"), ...listed("UNIMPLEMENTED")]);

    // Shipped rollback keys the CLI never registered. Adding them to
    // IMPLEMENTED would also add them to `--all-implemented`, which would turn
    // features on rather than leave them rollback-only, so they are recorded
    // here until that distinction exists. Listed in TO-DO-LIST.md.
    const knownAbsent = new Set(["birthday_wishes_v1", "message_board_v1", "archive_handover_v1"]);

    const missing = featureFlagKeys.filter((key) => !known.has(key) && !knownAbsent.has(key));
    expect(missing).toEqual([]);
  });

  it("does not offer a key the application no longer declares", () => {
    const match = source.match(/const IMPLEMENTED = \[([\s\S]*?)\];/u);
    const implemented = [...(match?.[1] ?? "").matchAll(/"([a-z0-9_]+)"/gu)].map((entry) => entry[1]);
    expect(implemented.filter((key) => !featureFlagKeys.includes(key as never))).toEqual([]);
  });
});

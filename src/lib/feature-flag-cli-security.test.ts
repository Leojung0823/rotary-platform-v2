import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
});

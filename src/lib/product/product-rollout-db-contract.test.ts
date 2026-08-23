import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { featureFlagKeys } from "./feature-flags";
import { productTelemetryEventNames } from "./telemetry";

function quotedValues(fragment: string): string[] {
  return [...fragment.matchAll(/'([a-z0-9_]+)'/gu)].map((match) => match[1]);
}

function assertExactSet(actual: readonly string[], expected: readonly string[]) {
  expect([...actual].sort()).toEqual([...expected].sort());
}

const featureFlagMigration = readFileSync(
  // Keep this pointed at the newest forward-only migration that redeclares
  // the feature-key constraint and mutation allow-list.
  resolve(process.cwd(), "supabase/migrations/20260823000100_existing_domain_feature_flags.sql"),
  "utf8",
);
const telemetryMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260806000200_product_rollout_telemetry.sql"),
  "utf8",
);

describe("product rollout TypeScript and database contracts", () => {
  it("keeps the TypeScript feature-key union exactly equal to the database constraint", () => {
    const featureConstraint = featureFlagMigration.match(
      /add constraint platform_feature_flags_feature_key_check check \(feature_key in \(([\s\S]+?)\)\);/,
    );
    expect(featureConstraint?.[1]).toBeDefined();
    assertExactSet(quotedValues(featureConstraint?.[1] ?? ""), featureFlagKeys);
  });

  it("would fail if either feature-key side gains an unmatched key", () => {
    expect(() => assertExactSet([...featureFlagKeys, "unmatched_key"], featureFlagKeys)).toThrow();
    expect(() => assertExactSet(featureFlagKeys, [...featureFlagKeys, "unmatched_key"])).toThrow();
  });

  it("keeps the TypeScript telemetry event allowlist exactly equal to the database constraint", () => {
    const eventConstraint = telemetryMigration.match(
      /event_name text not null check \(event_name in \(([\s\S]+?)\)\s*\),\n  payload/,
    );
    expect(eventConstraint?.[1]).toBeDefined();
    assertExactSet(quotedValues(eventConstraint?.[1] ?? ""), productTelemetryEventNames);
  });
});

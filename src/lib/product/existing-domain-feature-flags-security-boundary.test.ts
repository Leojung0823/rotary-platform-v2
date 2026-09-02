import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { featureFlagKeys } from "./feature-flags";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function quotedValues(fragment: string): string[] {
  return [...fragment.matchAll(/'([a-z0-9_]+)'/gu)].map((match) => match[1]);
}

const rollbackKeys = [
  "birthday_wishes_v1",
  "message_board_v1",
  "archive_handover_v1",
] as const;

describe("existing-domain feature-flag database contract", () => {
  const migration = source("supabase/migrations/20260902000100_line_oa_push_feature_flags.sql");

  it("keeps both table constraints and the mutation allow-list in sync", () => {
    const constraints = [...migration.matchAll(
      /add constraint platform_feature_flag(?:s|_audit)_feature_key_check check \(feature_key in \(([\s\S]+?)\)\);/gu,
    )];
    expect(constraints).toHaveLength(2);
    for (const constraint of constraints) {
      expect(quotedValues(constraint[1] ?? "").sort()).toEqual([...featureFlagKeys].sort());
    }

    const rpcAllowList = migration.match(
      /if p_feature_key not in \(([\s\S]+?)\) or p_enabled is null/u,
    );
    expect(quotedValues(rpcAllowList?.[1] ?? "").sort()).toEqual([...featureFlagKeys].sort());
  });

  it("does not seed a row that would unexpectedly change existing visibility", () => {
    const schemaOnlyPrefix = migration.slice(0, migration.indexOf("create or replace function"));
    expect(schemaOnlyPrefix).not.toMatch(/insert into public\.platform_feature_flags/u);
  });
});

describe("existing-domain direct-route gates", () => {
  const routes = [
    [
      "src/app/(authenticated)/birthdays/page.tsx",
      "birthday_wishes_v1",
      "if (!v1Evaluation.enabled && !v2Evaluation.enabled) notFound();",
    ],
    [
      "src/app/(authenticated)/board/page.tsx",
      "message_board_v1",
      "if (!evaluation.enabled) notFound();",
    ],
    [
      "src/app/(authenticated)/archives/page.tsx",
      "archive_handover_v1",
      "if (!evaluation.enabled) notFound();",
    ],
  ] as const;

  it.each(routes)("fails closed before data loading in %s", (path, key, guard) => {
    const page = source(path);
    expect(page).toContain(`key: "${key}"`);
    expect(page).toContain(guard);
    expect(page.indexOf(guard))
      .toBeLessThan(page.indexOf("await createClient()"));
  });
});

describe("Interact navigation gates", () => {
  const interact = source("src/app/(authenticated)/interact/page.tsx");

  it("uses the direct-page keys for the existing message-board and birthday cards", () => {
    expect(interact).toContain('evaluateCurrentFeatureFlag({ key: "message_board_v1"');
    expect(interact).toContain('evaluateCurrentFeatureFlag({ key: "birthday_wishes_v1"');
    expect(interact).toContain('evaluateCurrentFeatureFlag({ key: "birthday_wishes_v2"');
    expect(interact).toMatch(/if \(messageBoard\.enabled\) \{[\s\S]+?href: "\/board"/u);
    expect(interact).toMatch(/if \(birthdayWishesEnabled\) \{[\s\S]+?href: "\/birthdays"/u);
  });

  it("keeps all three rollback keys in the server evaluator union", () => {
    expect(featureFlagKeys).toEqual(expect.arrayContaining([...rollbackKeys]));
  });
});

describe("legacy and product-map navigation gates", () => {
  const legacyShell = source("src/components/app-shell.tsx");
  const roleAwareShell = source("src/components/role-aware-app-shell.tsx");
  const features = source("src/lib/product/features.ts");
  const featuresPage = source("src/app/(authenticated)/features/page.tsx");

  it("uses the board flag for both legacy-shell links", () => {
    expect(roleAwareShell).toContain('key: "message_board_v1"');
    expect(roleAwareShell).toContain("messageBoardEnabled={messageBoardEvaluation.enabled}");
    expect(legacyShell.match(/messageBoardEnabled && <Link href="\/board">/gu)).toHaveLength(2);
  });

  it("marks every existing-domain feature card with its direct-page key", () => {
    expect(features).toMatch(/slug: "message-board",[\s\S]+?featureFlagKey: "message_board_v1"/u);
    expect(features).toMatch(/slug: "documents",[\s\S]+?featureFlagKey: "archive_handover_v1"/u);
    expect(features).toMatch(/slug: "birthday-and-care",[\s\S]+?featureFlagKey: "birthday_wishes_v1"/u);
    expect(featuresPage).toContain("evaluateCurrentFeatureFlag({");
    expect(featuresPage).toContain("!disabledSlugs.has(feature.slug)");
  });
});

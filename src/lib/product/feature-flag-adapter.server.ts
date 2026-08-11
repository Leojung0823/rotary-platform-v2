import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  evaluateFeatureFlag,
  featureFlagKeys,
  parseFeatureFlagRecord,
  resolveRuntimeAppEnvironment,
  type FeatureFlagEvaluation,
  type FeatureFlagKey,
  type FeatureFlagRecord,
} from "./feature-flags";

type FeatureFlagRow = Readonly<{
  feature_key: unknown;
  enabled: unknown;
  enabled_environments: unknown;
  rollout_percentage: unknown;
}>;

export type FeatureFlagReadResult =
  | Readonly<{ ok: true; records: ReadonlyMap<FeatureFlagKey, FeatureFlagRecord> }>
  | Readonly<{ ok: false; records: ReadonlyMap<FeatureFlagKey, FeatureFlagRecord> }>;

function isFeatureFlagRow(value: unknown): value is FeatureFlagRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFeatureFlagKey(value: unknown): FeatureFlagKey | null {
  return typeof value === "string" && featureFlagKeys.includes(value as FeatureFlagKey)
    ? value as FeatureFlagKey
    : null;
}

export function parseFeatureFlagRows(rows: unknown): FeatureFlagReadResult {
  if (!Array.isArray(rows)) return { ok: false, records: new Map() };

  const records = new Map<FeatureFlagKey, FeatureFlagRecord>();
  for (const row of rows) {
    if (!isFeatureFlagRow(row)) return { ok: false, records: new Map() };
    const key = toFeatureFlagKey(row.feature_key);
    const record = parseFeatureFlagRecord({
      enabled: row.enabled,
      enabledEnvironments: row.enabled_environments,
      rolloutPercentage: row.rollout_percentage,
    });
    if (!key || !record || records.has(key)) return { ok: false, records: new Map() };
    records.set(key, record);
  }

  return { ok: true, records };
}

// React cache is request-scoped for Server Components. It deliberately provides
// no cross-request TTL, so it cannot delay an emergency kill switch read.
export const readFeatureFlagRecords = cache(async (): Promise<FeatureFlagReadResult> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_platform_feature_flags");
    if (error) return { ok: false, records: new Map() };
    return parseFeatureFlagRows(data);
  } catch {
    return { ok: false, records: new Map() };
  }
});

async function evaluateCurrentFeatureFlagWithEnvironment({
  key,
  subjectUuid,
  environment,
}: {
  key: FeatureFlagKey;
  subjectUuid?: string;
  environment: Readonly<Record<string, string | undefined>>;
}): Promise<FeatureFlagEvaluation> {
  const result = await readFeatureFlagRecords();
  return evaluateFeatureFlag({
    key,
    record: result.ok ? result.records.get(key) : null,
    databaseReadFailed: !result.ok,
    environment: resolveRuntimeAppEnvironment(environment),
    subjectUuid,
    pepper: environment.FEATURE_FLAG_ROLLOUT_PEPPER,
    env: environment,
  });
}

const evaluateCurrentFeatureFlagForRequest = cache(async (
  key: FeatureFlagKey,
  subjectUuid?: string,
) => evaluateCurrentFeatureFlagWithEnvironment({ key, subjectUuid, environment: process.env }));

export async function evaluateCurrentFeatureFlag({
  key,
  subjectUuid,
  environment,
}: {
  key: FeatureFlagKey;
  subjectUuid?: string;
  environment?: Readonly<Record<string, string | undefined>>;
}): Promise<FeatureFlagEvaluation> {
  return environment
    ? evaluateCurrentFeatureFlagWithEnvironment({ key, subjectUuid, environment })
    : evaluateCurrentFeatureFlagForRequest(key, subjectUuid);
}

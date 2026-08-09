import "server-only";
import { createClient } from "@/lib/supabase/server";
import { recordAuthenticatedProductTelemetry } from "@/lib/product/telemetry.server";
import type { ProductTelemetryEvent } from "@/lib/product/telemetry";
import {
  applyActiveClubPreference,
  parseExperienceContextProjection,
  type ExperienceContext,
  type ExperienceContextProjection,
} from "./experience-context";

export type ExperienceContextFailureReason =
  | "database_unavailable"
  | "invalid_projection"
  | "authorization_denied"
  | "unexpected";

export type ExperienceContextResolution =
  | Readonly<{ ok: true; context: ExperienceContext }>
  | Readonly<{ ok: false; reason: ExperienceContextFailureReason }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function classifyExperienceContextFailure(error: unknown): ExperienceContextFailureReason {
  if (isRecord(error) && error.code === "42501") return "authorization_denied";
  return "database_unavailable";
}

export function resolveExperienceContextValue(
  value: unknown,
  preferredClubId: unknown,
): ExperienceContextResolution {
  const projection: ExperienceContextProjection | null = parseExperienceContextProjection(value);
  return projection
    ? { ok: true, context: applyActiveClubPreference(projection, preferredClubId) }
    : { ok: false, reason: "invalid_projection" };
}

export function experienceContextTelemetryEvent(
  resolution: ExperienceContextResolution,
  durationMs: number,
): ProductTelemetryEvent {
  const boundedDuration = Math.max(0, Math.min(120_000, Math.round(durationMs)));
  return resolution.ok
    ? {
      name: "member_context_resolve_success",
      durationMs: boundedDuration,
      clubCount: resolution.context.memberClubs.length + resolution.context.managedOnlyClubs.length,
      modeCount: resolution.context.availableModes.length,
    }
    : {
      name: "member_context_resolve_failure",
      durationMs: boundedDuration,
      reason: resolution.reason,
    };
}

async function recordResolutionTelemetry({
  startedAt,
  resolution,
}: {
  startedAt: number;
  resolution: ExperienceContextResolution;
}) {
  const event = experienceContextTelemetryEvent(resolution, performance.now() - startedAt);
  try {
    await recordAuthenticatedProductTelemetry(event);
  } catch {
    // Telemetry cannot change a routing or authorization outcome.
  }
}

export async function resolveExperienceContext(
  preferredClubId: unknown,
): Promise<ExperienceContextResolution> {
  const startedAt = performance.now();
  let resolution: ExperienceContextResolution;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("resolve_my_experience_context");
    resolution = error
      ? { ok: false, reason: classifyExperienceContextFailure(error) }
      : resolveExperienceContextValue(data, preferredClubId);
  } catch {
    resolution = { ok: false, reason: "unexpected" };
  }

  await recordResolutionTelemetry({ startedAt, resolution });
  return resolution;
}

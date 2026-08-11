import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { recordAuthenticatedProductTelemetry } from "@/lib/product/telemetry.server";
import { parseMemberHomeProjection, type MemberHomeProjection } from "./member-home";

export type MemberHomeFailureReason =
  | "database_unavailable"
  | "invalid_projection"
  | "authorization_denied"
  | "unexpected";

export type MemberHomeResolution =
  | Readonly<{ ok: true; projection: MemberHomeProjection }>
  | Readonly<{ ok: false; reason: MemberHomeFailureReason }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function classifyMemberHomeFailure(error: unknown): MemberHomeFailureReason {
  return isRecord(error) && error.code === "42501" ? "authorization_denied" : "database_unavailable";
}

export function memberHomeTelemetryEvent(
  resolution: MemberHomeResolution,
  durationMs: number,
) {
  const boundedDuration = Math.max(0, Math.min(120_000, Math.round(durationMs)));
  return resolution.ok
    ? { name: "member_home_projection_duration" as const, durationMs: boundedDuration, databaseRoundTrips: 1 }
    : { name: "member_home_projection_failure" as const, durationMs: boundedDuration, reason: resolution.reason };
}

async function recordProjectionTelemetry(resolution: MemberHomeResolution, startedAt: number) {
  try {
    await recordAuthenticatedProductTelemetry(memberHomeTelemetryEvent(resolution, performance.now() - startedAt));
  } catch {
    // Observability cannot change a member's homepage result.
  }
}

export const resolveMemberHomeProjection = cache(async function resolveMemberHomeProjection(
  clubId: string,
): Promise<MemberHomeResolution> {
  const startedAt = performance.now();
  let resolution: MemberHomeResolution;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_my_member_home_projection", { p_club_id: clubId });
    if (error) resolution = { ok: false, reason: classifyMemberHomeFailure(error) };
    else {
      const projection = parseMemberHomeProjection(data);
      resolution = projection ? { ok: true, projection } : { ok: false, reason: "invalid_projection" };
    }
  } catch {
    resolution = { ok: false, reason: "unexpected" };
  }

  await recordProjectionTelemetry(resolution, startedAt);
  return resolution;
});

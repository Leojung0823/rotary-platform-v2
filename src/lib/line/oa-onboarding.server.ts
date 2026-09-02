import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  parseLineOaOnboardingStatus,
  type LineOaOnboardingStatus,
} from "./oa-onboarding";

export type LineOaOnboardingResolution =
  | Readonly<{ ok: true; status: LineOaOnboardingStatus }>
  | Readonly<{ ok: false; reason: "authorization_denied" | "invalid_projection" | "unavailable" }>;

function failureReason(error: unknown): "authorization_denied" | "unavailable" {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === "42501"
    ? "authorization_denied"
    : "unavailable";
}

export const resolveLineOaOnboardingStatus = cache(async function resolveLineOaOnboardingStatus(
  clubId: string,
): Promise<LineOaOnboardingResolution> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_my_line_oa_onboarding_status", {
      p_club_id: clubId,
    });
    if (error) return { ok: false, reason: failureReason(error) };
    const status = parseLineOaOnboardingStatus(data);
    return status
      ? { ok: true, status }
      : { ok: false, reason: "invalid_projection" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
});

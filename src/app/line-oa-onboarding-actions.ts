"use server";

import { revalidatePath } from "next/cache";
import { requireIdentity } from "@/lib/auth";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type DismissLineOaOnboardingResult = Readonly<{
  ok: boolean;
  reason?: "invalid_input" | "feature_disabled" | "not_allowed" | "unavailable";
}>;

export async function dismissLineOaOnboardingAction(
  clubId: string,
): Promise<DismissLineOaOnboardingResult> {
  if (!uuidPattern.test(clubId)) return { ok: false, reason: "invalid_input" };

  const identity = await requireIdentity();
  const evaluation = await evaluateCurrentFeatureFlag({
    key: "line_oa_onboarding_v1",
    subjectUuid: identity.id,
  });
  if (!evaluation.enabled) return { ok: false, reason: "feature_disabled" };

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("dismiss_my_line_oa_onboarding", {
      p_club_id: clubId,
    });
    if (error) {
      return { ok: false, reason: error.code === "42501" ? "not_allowed" : "unavailable" };
    }
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  revalidatePath("/dashboard");
  revalidatePath("/me");
  revalidatePath("/me/line-oa");
  return { ok: true };
}

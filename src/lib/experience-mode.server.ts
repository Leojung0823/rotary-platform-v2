import "server-only";
import { cookies, headers } from "next/headers";
import { resolveExperienceMode, type ExperienceMode } from "@/lib/experience-context";
import { activeClubCookieName, readActiveClubPreference } from "@/lib/experience-context-cookie";
import { resolveExperienceContext } from "@/lib/experience-context.server";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";

/**
 * The mode this request is being rendered in, resolved exactly as the shell
 * resolves it so a page and its surrounding navigation can never disagree.
 *
 * Returns null when there is no mode to speak of -- role shells are disabled,
 * or the context could not be resolved. Callers should then fall back to
 * permission-only behaviour rather than assuming the member view, because a
 * club operator with no membership has no member mode to fall back to.
 *
 * Both the flag evaluation and the context resolution are request-cached and
 * the shell has already awaited them, so this costs no additional round trip.
 */
export async function currentExperienceMode(subjectUuid: string): Promise<ExperienceMode | null> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const evaluation = await evaluateCurrentFeatureFlag({
    key: "role_shells_v2",
    subjectUuid,
  });
  if (!evaluation.enabled) return null;

  const resolution = await resolveExperienceContext(
    readActiveClubPreference(cookieStore.get(activeClubCookieName)?.value),
  );
  if (!resolution.ok) return null;

  return resolveExperienceMode(resolution.context, headerStore.get("x-rotary-requested-mode"));
}

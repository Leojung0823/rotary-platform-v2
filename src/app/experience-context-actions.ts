"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  activeClubCookieName,
  activeClubCookieOptions,
  readActiveClubPreference,
} from "@/lib/experience-context-cookie";
import { resolveExperienceContext } from "@/lib/experience-context.server";
import { resolveExperienceMode } from "@/lib/experience-context";

export async function setActiveClubPreferenceAction(formData: FormData) {
  const resolution = await resolveExperienceContext(readActiveClubPreference(formData.get("clubId")));
  if (!resolution.ok) redirect("/access-denied");

  const cookieStore = await cookies();
  if (resolution.context.activeClubId) {
    cookieStore.set(
      activeClubCookieName,
      resolution.context.activeClubId,
      activeClubCookieOptions(),
    );
  } else {
    cookieStore.delete(activeClubCookieName);
  }

  const mode = resolveExperienceMode(resolution.context, formData.get("mode"));
  redirect(`/dashboard?mode=${encodeURIComponent(mode)}`);
}

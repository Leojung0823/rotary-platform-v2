"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  activeClubCookieName,
  activeClubCookieOptions,
  readActiveClubPreference,
} from "@/lib/experience-context-cookie";
import { resolveExperienceContext } from "@/lib/experience-context.server";
import { resolveActiveClubPreferenceChange } from "@/lib/experience-context";

export async function setActiveClubPreferenceAction(formData: FormData) {
  const cookieStore = await cookies();
  const resolution = await resolveExperienceContext(
    readActiveClubPreference(cookieStore.get(activeClubCookieName)?.value),
  );
  if (!resolution.ok) redirect("/access-denied");

  const preference = resolveActiveClubPreferenceChange(
    resolution.context,
    formData.get("mode"),
    readActiveClubPreference(formData.get("clubId")),
  );
  if (preference.clubId) {
    cookieStore.set(
      activeClubCookieName,
      preference.clubId,
      activeClubCookieOptions(),
    );
  } else {
    cookieStore.delete(activeClubCookieName);
  }

  redirect(`/dashboard?mode=${encodeURIComponent(preference.mode)}`);
}

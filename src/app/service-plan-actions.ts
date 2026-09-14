"use server";

import { redirect } from "next/navigation";
import { resolveExperienceContext } from "@/lib/experience-context.server";
import { createClient } from "@/lib/supabase/server";
import { mapDatabaseError } from "@/lib/validation";

export async function saveClubServicePlanAction(formData: FormData) {
  const startYear = Number.parseInt(String(formData.get("startYear") ?? ""), 10);
  const publish = String(formData.get("publish") ?? "") === "publish";
  const editPath = `/club-affairs/service-plan/edit?year=${Number.isNaN(startYear) ? "" : startYear}`;

  const resolution = await resolveExperienceContext(null);
  const activeClubId = resolution.ok ? resolution.context.activeClubId : null;
  if (!activeClubId || Number.isNaN(startYear)) {
    redirect(`${editPath}&error=unexpected`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_club_service_plan", {
    p_club_id: activeClubId,
    p_start_year: startYear,
    p_title: String(formData.get("title") ?? ""),
    p_body: String(formData.get("body") ?? ""),
    p_publish: publish,
  });
  if (error) redirect(`${editPath}&error=${encodeURIComponent(mapDatabaseError(error.message))}`);
  redirect(`/club-affairs?year=${startYear}`);
}

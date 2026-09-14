"use server";

import { redirect } from "next/navigation";
import { SERVICE_PLAN_CATEGORIES } from "@/lib/club-affairs/service-plan";
import { createClient } from "@/lib/supabase/server";
import { mapDatabaseError } from "@/lib/validation";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function textField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function managementPath(clubId: string, startYear: number, error?: string) {
  const query = new URLSearchParams({ mode: "management", year: String(startYear) });
  if (error) query.set("error", error);
  return `/clubs/${encodeURIComponent(clubId)}/service-plan?${query.toString()}`;
}

export async function saveClubServicePlanV2Action(formData: FormData) {
  const clubId = textField(formData, "clubId").trim();
  const startYear = Number.parseInt(textField(formData, "startYear"), 10);
  const publish = textField(formData, "publish") === "publish";

  if (!uuidPattern.test(clubId) || !Number.isInteger(startYear) || startYear < 2000 || startYear > 2200) {
    redirect("/dashboard?mode=management&error=invalid_input");
  }

  const sections = SERVICE_PLAN_CATEGORIES.map(({ key }) => ({
    category_key: key,
    progress_status: textField(formData, `section_${key}_status`),
    annual_goal: textField(formData, `section_${key}_annualGoal`),
    activities: textField(formData, `section_${key}_activities`),
    latest_result: textField(formData, `section_${key}_latestResult`),
    next_step: textField(formData, `section_${key}_nextStep`),
    member_participation: textField(formData, `section_${key}_memberParticipation`),
  }));

  const { error } = await (await createClient()).rpc("upsert_club_service_plan_v2", {
    p_club_id: clubId,
    p_start_year: startYear,
    p_title: textField(formData, "title"),
    p_body: textField(formData, "body"),
    p_annual_theme: textField(formData, "annualTheme"),
    p_member_invitation: textField(formData, "memberInvitation"),
    p_publish: publish,
    p_sections: sections,
  });
  if (error) {
    redirect(managementPath(clubId, startYear, mapDatabaseError(error.message)));
  }
  redirect(`${managementPath(clubId, startYear)}&success=saved`);
}

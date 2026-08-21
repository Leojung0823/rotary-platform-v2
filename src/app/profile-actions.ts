"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mapDatabaseError, parseMemberInput } from "@/lib/validation";

function errorPath(code: string) {
  return `/me?error=${encodeURIComponent(code)}`;
}

export async function updateMyProfileAction(formData: FormData) {
  let input;
  try {
    input = parseMemberInput(formData);
  } catch (error) {
    redirect(errorPath(error instanceof Error ? error.message : "unexpected"));
  }

  // update_my_profile requires a contact, unlike the shared member parser --
  // a member the secretary created may legitimately have neither. Checking it
  // here turns a generic database rejection into the specific reason.
  if (!input.phone && !input.email) redirect(errorPath("missing_contact"));

  const occupation = String(formData.get("occupation") ?? "").trim().slice(0, 100);

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_profile", {
    p_name: input.name,
    p_phone: input.phone || null,
    p_email: input.email || null,
    p_birth_date: input.birthDate,
    p_occupation: occupation || null,
  });

  if (error) redirect(errorPath(mapDatabaseError(error.message)));
  redirect("/me?success=profile_updated");
}

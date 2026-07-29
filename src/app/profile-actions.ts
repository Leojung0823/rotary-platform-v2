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

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_profile", {
    p_name: input.name,
    p_phone: input.phone || null,
    p_email: input.email || null,
    p_birth_date: input.birthDate,
  });

  if (error) redirect(errorPath(mapDatabaseError(error.message)));
  redirect("/me?success=profile_updated");
}

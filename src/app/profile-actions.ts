"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mapDatabaseError, parseMemberInput } from "@/lib/validation";

function errorPath(code: string) {
  return `/me/profile?error=${encodeURIComponent(code)}`;
}

export async function updateMyProfileAction(formData: FormData) {
  let input;
  try {
    input = parseMemberInput(formData);
  } catch (error) {
    redirect(errorPath(error instanceof Error ? error.message : "unexpected"));
  }

  const supabase = await createClient();
  const avatarEntry = formData.get("avatar");
  const avatar = avatarEntry instanceof File && avatarEntry.size > 0 ? avatarEntry : null;
  const removeAvatar = formData.get("removeAvatar") === "on";
  let avatarReference: string | null | undefined;

  if (avatar) {
    if (avatar.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(avatar.type)) {
      redirect(errorPath("invalid_avatar"));
    }
    const userResult = await supabase.auth.getUser();
    if (!userResult.data.user) redirect(errorPath("forbidden"));
    const objectPath = `${userResult.data.user.id}/profile`;
    const upload = await supabase.storage.from("member-avatars").upload(objectPath, avatar, {
      contentType: avatar.type,
      upsert: true,
    });
    if (upload.error) redirect(errorPath("invalid_avatar"));
    avatarReference = `member-avatar:${objectPath}`;
  } else if (removeAvatar) {
    const userResult = await supabase.auth.getUser();
    if (!userResult.data.user) redirect(errorPath("forbidden"));
    await supabase.storage.from("member-avatars").remove([`${userResult.data.user.id}/profile`]);
    avatarReference = null;
  }

  const { error } = await supabase.rpc("update_my_profile", {
    p_name: input.name,
    p_phone: input.phone || null,
    p_email: input.email || null,
    p_birth_date: input.birthDate,
  });

  if (error) redirect(errorPath(mapDatabaseError(error.message)));
  if (avatarReference !== undefined) {
    const avatarResult = await supabase.rpc("update_my_avatar_reference", { p_avatar_reference: avatarReference });
    if (avatarResult.error) redirect(errorPath("invalid_avatar"));
  }
  redirect("/me/profile?success=profile_updated");
}

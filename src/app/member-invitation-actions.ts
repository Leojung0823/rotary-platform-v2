"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mapDatabaseError, parseMemberInput } from "@/lib/validation";

function errorPath(path: string, code: string) {
  return `${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(code)}`;
}

function invitationIdempotencyKey(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return /^[A-Za-z0-9._:-]{8,200}$/.test(key) ? key : null;
}

export async function createMemberInvitationAction(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "");
  const returnPath = `/clubs/${clubId}/members/new`;
  const idempotencyKey = invitationIdempotencyKey(formData.get("idempotencyKey"));
  if (!idempotencyKey) redirect(errorPath(returnPath, "invalid_request"));

  let input;
  try {
    input = parseMemberInput(formData);
  } catch (error) {
    redirect(errorPath(returnPath, error instanceof Error ? error.message : "unexpected"));
  }

  const delivery = String(formData.get("deliveryMethod") ?? "link");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_member_invitation", {
    p_club_id: clubId,
    p_name: input.name,
    p_phone: input.phone || null,
    p_email: input.email || null,
    p_birth_date: input.birthDate,
    p_delivery_method: delivery,
    p_idempotency_key: idempotencyKey,
  });
  if (error || !data) {
    redirect(errorPath(returnPath, mapDatabaseError(error?.message ?? "")));
  }

  const result = data as { token: string | null; invitation_id: string };
  const tokenPart = result.token ? `&token=${encodeURIComponent(result.token)}` : "";
  redirect(`/clubs/${clubId}/invitations?success=created${tokenPart}&invitation=${result.invitation_id}`);
}

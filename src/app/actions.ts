"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createLocalAdminClient } from "@/lib/supabase/admin";
import { mapDatabaseError, parseClubInput, parseNewPassword, parseOperatorInput } from "@/lib/validation";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorPath(path: string, code: string) {
  return `${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(code)}`;
}

async function sendLocalInvite(email: string, inviteId: string) {
  const admin = createLocalAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/invite/accept`,
  });
  if (error) throw error;
  const supabase = await createClient();
  const { error: markError } = await supabase.rpc("mark_operator_invitation_sent", {
    p_invite_id: inviteId,
  });
  if (markError) throw markError;
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect(errorPath("/login", "invalid_credentials"));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(errorPath("/login", "invalid_credentials"));
  redirect("/dashboard");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createClubAction(formData: FormData) {
  let input;
  try {
    input = parseClubInput(formData);
  } catch (error) {
    redirect(errorPath("/platform/clubs/new", error instanceof Error ? error.message : "unexpected"));
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_club_with_initial_operator_invitation", {
    p_club_code: input.clubCode,
    p_club_name: input.clubName,
    p_operator_email: input.operatorEmail,
    p_operator_display_name: input.operatorName,
    p_idempotency_key: randomUUID(),
  });
  if (error || !data) redirect(errorPath("/platform/clubs/new", mapDatabaseError(error?.message ?? "")));
  const result = data as { club_id: string; invite_id: string };
  try {
    await sendLocalInvite(input.operatorEmail, result.invite_id);
  } catch {
    redirect(`/platform/clubs/${result.club_id}?error=invite_failed`);
  }
  redirect(`/platform/clubs/${result.club_id}?success=club_created`);
}

export async function inviteOperatorAction(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "");
  const returnPath = `/clubs/${clubId}/operators`;
  let input;
  try {
    input = parseOperatorInput(formData);
  } catch (error) {
    redirect(errorPath(returnPath, error instanceof Error ? error.message : "unexpected"));
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invite_additional_operator", {
    p_club_id: clubId,
    p_email: input.email,
    p_display_name: input.displayName,
    p_idempotency_key: randomUUID(),
  });
  if (error || !data) redirect(errorPath(returnPath, mapDatabaseError(error?.message ?? "")));
  const result = data as { invite_id: string };
  try {
    await sendLocalInvite(input.email, result.invite_id);
  } catch {
    redirect(errorPath(returnPath, "invite_failed"));
  }
  redirect(`${returnPath}?success=invited`);
}

export async function acceptInvitationAction(formData: FormData) {
  const inviteId = String(formData.get("inviteId") ?? "").trim();
  if (!uuidPattern.test(inviteId)) redirect(errorPath("/invite/accept", "invite_not_found"));

  let password;
  try {
    password = parseNewPassword(formData);
  } catch (error) {
    redirect(errorPath("/invite/accept", error instanceof Error ? error.message : "invalid_password"));
  }

  const supabase = await createClient();
  const { error: passwordError } = await supabase.auth.updateUser({ password });
  if (passwordError) redirect(errorPath("/invite/accept", "invalid_password"));

  const { data, error } = await supabase.rpc("accept_selected_operator_invitation", {
    p_invite_id: inviteId,
  });
  if (error || !data) redirect(errorPath("/invite/accept", mapDatabaseError(error?.message ?? "")));
  const result = data as { club_id: string };
  redirect(`/clubs/${result.club_id}/operators?success=accepted`);
}

export async function revokeOperatorAction(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "");
  const permissionId = String(formData.get("permissionId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const returnPath = `/clubs/${clubId}/operators`;
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_operator", {
    p_club_id: clubId,
    p_operator_permission_id: permissionId,
    p_reason: reason || "由管理員撤銷",
  });
  if (error) redirect(errorPath(returnPath, mapDatabaseError(error.message)));
  redirect(`${returnPath}?success=revoked`);
}

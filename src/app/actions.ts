"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { sendLineOaMessage } from "@/lib/line/messaging";
import { createTrustedAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  mapDatabaseError,
  parseClubInput,
  parseMemberInput,
  parseNewPassword,
  parseOperatorInput,
  isValidClubName,
} from "@/lib/validation";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorPath(path: string, code: string) {
  return `${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(code)}`;
}

async function provisionOperatorAccount(email: string, password: string, inviteId: string) {
  const admin = createTrustedAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("operator_account_creation_failed");
  const supabase = await createClient();
  const { error: provisionError } = await supabase.rpc("provision_operator_account", {
    p_invite_id: inviteId,
    p_target_auth_user_id: data.user.id,
  });
  if (provisionError) throw provisionError;
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
    await provisionOperatorAccount(input.operatorEmail, input.operatorPassword, result.invite_id);
  } catch {
    redirect(`/platform/clubs/${result.club_id}?error=invite_failed`);
  }
  redirect(`/platform/clubs/${result.club_id}?success=club_created`);
}

export async function updateClubNameAction(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "");
  const managementReturnPath = `/clubs/${clubId}/identity`;
  const returnPath = String(formData.get("returnPath") ?? "") === managementReturnPath
    ? managementReturnPath
    : `/platform/clubs/${clubId}`;
  const clubName = String(formData.get("clubName") ?? "").trim();
  if (!isValidClubName(clubName)) redirect(errorPath(returnPath, "invalid_club_name"));

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_club_name", { p_club_id: clubId, p_club_name: clubName });
  if (error) redirect(errorPath(returnPath, mapDatabaseError(error.message)));
  redirect(`${returnPath}?success=renamed`);
}

export async function archiveClubAction(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "");
  const returnPath = `/platform/clubs/${clubId}`;
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_club", { p_club_id: clubId });
  if (error) redirect(errorPath(returnPath, mapDatabaseError(error.message)));
  redirect(`${returnPath}?success=archived`);
}

export async function unarchiveClubAction(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "");
  const returnPath = `/platform/clubs/${clubId}`;
  const supabase = await createClient();
  const { error } = await supabase.rpc("unarchive_club", { p_club_id: clubId });
  if (error) redirect(errorPath(returnPath, mapDatabaseError(error.message)));
  redirect(`${returnPath}?success=unarchived`);
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
    await provisionOperatorAccount(input.email, input.password, result.invite_id);
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

export async function createMemberAction(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "");
  let input;
  try {
    input = parseMemberInput(formData);
  } catch (error) {
    redirect(errorPath(`/clubs/${clubId}/members/new`, error instanceof Error ? error.message : "unexpected"));
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
    p_idempotency_key: randomUUID(),
  });
  if (error || !data) redirect(errorPath(`/clubs/${clubId}/members/new`, mapDatabaseError(error?.message ?? "")));
  const result = data as { token: string; invitation_id: string };
  redirect(`/clubs/${clubId}/invitations?success=created&token=${encodeURIComponent(result.token)}&invitation=${result.invitation_id}`);
}

export async function resendMemberInvitationAction(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "");
  const invitationId = String(formData.get("invitationId") ?? "");
  const delivery = String(formData.get("deliveryMethod") ?? "link");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resend_member_invitation", {
    p_invitation_id: invitationId,
    p_delivery_method: delivery,
  });
  if (error || !data) redirect(errorPath(`/clubs/${clubId}/invitations`, mapDatabaseError(error?.message ?? "")));
  redirect(`/clubs/${clubId}/invitations?success=resent&token=${encodeURIComponent((data as { token: string }).token)}&invitation=${invitationId}`);
}

export async function cancelMemberInvitationAction(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_member_invitation", {
    p_invitation_id: String(formData.get("invitationId") ?? ""),
    p_reason: String(formData.get("reason") ?? "由秘書取消"),
  });
  if (error) redirect(errorPath(`/clubs/${clubId}/invitations`, mapDatabaseError(error.message)));
  redirect(`/clubs/${clubId}/invitations?success=cancelled`);
}

export async function completeMemberJoinAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  let input;
  try {
    input = parseMemberInput(formData);
  } catch (error) {
    redirect(errorPath(`/join?token=${encodeURIComponent(token)}`, error instanceof Error ? error.message : "unexpected"));
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("complete_member_invitation", {
    p_token: token,
    p_name: input.name,
    p_phone: input.phone || null,
    p_email: input.email || null,
    p_birth_date: input.birthDate,
  });
  if (error || !data) redirect(errorPath(`/join?token=${encodeURIComponent(token)}`, mapDatabaseError(error?.message ?? "")));
  redirect(`/club/${(data as { club_id: string }).club_id}?welcome=1`);
}

export async function updateMemberAction(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  let input;
  try {
    input = parseMemberInput(formData);
  } catch (error) {
    redirect(errorPath(`/clubs/${clubId}/members/${membershipId}`, error instanceof Error ? error.message : "unexpected"));
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_member_profile", {
    p_club_id: clubId,
    p_membership_id: membershipId,
    p_name: input.name,
    p_phone: input.phone || null,
    p_email: input.email || null,
    p_birth_date: input.birthDate,
  });
  if (error) redirect(errorPath(`/clubs/${clubId}/members/${membershipId}`, mapDatabaseError(error.message)));
  redirect(`/clubs/${clubId}/members/${membershipId}?success=updated`);
}

export async function setMemberStatusAction(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_membership_status", {
    p_club_id: clubId,
    p_membership_id: String(formData.get("membershipId") ?? ""),
    p_status: String(formData.get("status") ?? ""),
    p_reason: String(formData.get("reason") ?? "後台狀態調整"),
  });
  if (error) redirect(errorPath(`/clubs/${clubId}/members`, mapDatabaseError(error.message)));
  redirect(`/clubs/${clubId}/members?success=status_updated`);
}

export async function assignClubRoleAction(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_club_role", {
    p_club_id: clubId,
    p_app_account_id: String(formData.get("accountId") ?? ""),
    p_role_key: String(formData.get("roleKey") ?? "member"),
  });
  if (error) redirect(errorPath(`/clubs/${clubId}/members/${membershipId}`, mapDatabaseError(error.message)));
  redirect(`/clubs/${clubId}/members/${membershipId}?success=role_updated`);
}

export async function unbindLineIdentityAction(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unbind_line_identity", {
    p_club_id: clubId,
    p_app_account_id: String(formData.get("accountId") ?? ""),
    p_reason: String(formData.get("reason") ?? "管理員解除綁定"),
    p_create_rebind: true,
  });
  if (error || !data) redirect(errorPath(`/clubs/${clubId}/members/${membershipId}`, mapDatabaseError(error?.message ?? "")));
  const result = data as { rebind_token?: string };
  redirect(`/clubs/${clubId}/members/${membershipId}?success=unbound${result.rebind_token ? `&token=${encodeURIComponent(result.rebind_token)}` : ""}`);
}

export async function updateIdentitySettingsAction(formData: FormData) {
  const supabase = await createClient();
  const bool = (name: string) => formData.get(name) === "on";
  const { error } = await supabase.rpc("update_my_settings", {
    p_notifications: {
      line_enabled: bool("lineEnabled"),
      email_enabled: bool("emailEnabled"),
      security_alerts: bool("securityAlerts"),
      club_announcements: bool("clubAnnouncements"),
    },
    p_privacy: {
      show_email_to_club: bool("showEmail"),
      show_phone_to_club: bool("showPhone"),
      show_birthday_year: bool("showBirthYear"),
      // analytics_consent is deliberately not sent: the RPC forces it true, so
      // supplying it here would only suggest the client had a say.
    },
  });
  if (error) redirect("/me?error=unexpected");
  redirect("/me?success=settings_saved");
}

export async function revokeDeviceAction(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_my_device", {
    p_device_id: String(formData.get("deviceId") ?? ""),
  });
  if (error) redirect("/me/security?error=unexpected");
  redirect("/me/security?success=device_revoked");
}

export async function configureLineOaAction(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("configure_line_oa", {
    p_club_id: clubId,
    p_display_name: String(formData.get("displayName") ?? ""),
    p_basic_id: String(formData.get("basicId") ?? ""),
    p_channel_id: String(formData.get("channelId") ?? ""),
    p_mode: "active",
  });
  if (error) redirect(errorPath(`/clubs/${clubId}/line-oa`, mapDatabaseError(error.message)));
  redirect(`/clubs/${clubId}/line-oa?success=configured`);
}

export async function pairLineOaAction(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("pair_line_oa_follower", {
    p_club_id: clubId,
    p_oa_user_id: String(formData.get("oaUserId") ?? ""),
    p_person_id: String(formData.get("personId") ?? ""),
  });
  if (error) redirect(errorPath(`/clubs/${clubId}/line-oa`, mapDatabaseError(error.message)));
  redirect(`/clubs/${clubId}/line-oa?success=paired`);
}

export async function unpairLineOaAction(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("unpair_line_oa_follower", {
    p_club_id: clubId,
    p_follower_id: String(formData.get("followerId") ?? ""),
    p_reason: String(formData.get("reason") ?? "管理員解除 OA 配對"),
  });
  if (error) redirect(errorPath(`/clubs/${clubId}/line-oa`, mapDatabaseError(error.message)));
  redirect(`/clubs/${clubId}/line-oa?success=unpaired`);
}

export async function sendLineOaAction(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "");
  const text = String(formData.get("message") ?? "").trim();
  const kind = String(formData.get("kind") ?? "broadcast") as "broadcast" | "multicast";
  if (!text || text.length > 2000) redirect(errorPath(`/clubs/${clubId}/line-oa`, "unexpected"));

  const supabase = await createClient();
  const permissions = await supabase.rpc("list_my_permissions", { p_club_id: clubId });
  if (
    permissions.error ||
    !(permissions.data as { permission_key: string }[]).some((item) => item.permission_key === "oa.manage")
  ) {
    redirect(errorPath(`/clubs/${clubId}/line-oa`, "forbidden"));
  }

  const admin = createTrustedAdminClient();
  const recipientsResult = await admin
    .from("line_oa_followers")
    .select("oa_user_id")
    .eq("club_id", clubId)
    .eq("follower_status", "following");
  if (recipientsResult.error) redirect(errorPath(`/clubs/${clubId}/line-oa`, "unexpected"));

  const recipients = (recipientsResult.data ?? []).map((row) => row.oa_user_id);
  let delivery;
  try {
    delivery = await sendLineOaMessage(kind, recipients, [{ type: "text", text }]);
  } catch {
    delivery = { status: "failed" as const, requestId: undefined };
  }

  const logged = await supabase.rpc("record_line_push", {
    p_club_id: clubId,
    p_push_kind: kind,
    p_recipient_count: recipients.length,
    p_payload_summary: { message_type: "text", character_count: text.length },
    p_delivery_status: delivery.status,
    p_provider_request_id: delivery.requestId ?? null,
    p_failure_code: delivery.status === "failed" ? "provider_error" : null,
  });
  if (logged.error || delivery.status === "failed") {
    redirect(errorPath(`/clubs/${clubId}/line-oa`, "unexpected"));
  }
  redirect(`/clubs/${clubId}/line-oa?success=message_sent`);
}

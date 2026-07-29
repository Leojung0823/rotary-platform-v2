"use server";

import { redirect } from "next/navigation";
import { createTrustedAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { mapDatabaseError } from "@/lib/validation";

const allowedAccountStatuses = new Set(["active", "suspended", "disabled"]);

function errorPath(path: string, code: string) {
  return `${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(code)}`;
}

export async function setMemberAccountStatusAction(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "").trim();
  const membershipId = String(formData.get("membershipId") ?? "").trim();
  const accountId = String(formData.get("accountId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const returnPath = `/clubs/${clubId}/members/${membershipId}`;

  if (!clubId || !membershipId || !accountId || !allowedAccountStatuses.has(status)
      || reason.length < 2 || reason.length > 500) {
    redirect(errorPath(returnPath, "unexpected"));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_account_status", {
    p_club_id: clubId,
    p_app_account_id: accountId,
    p_status: status,
    p_reason: reason,
  });

  if (error) redirect(errorPath(returnPath, mapDatabaseError(error.message)));
  redirect(`${returnPath}?success=account_status_updated`);
}

export async function unbindMyLineIdentityAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const reason = String(formData.get("reason") ?? "本人於會員中心解除 LINE Login").trim();

  if (!password || password.length > 1024 || reason.length < 2 || reason.length > 500) {
    redirect("/me?error=invalid_credentials");
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user?.email) redirect("/login");

  const reauthenticated = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (reauthenticated.error) redirect("/me?error=invalid_credentials");

  const admin = createTrustedAdminClient();
  const { error } = await admin.rpc("unbind_my_line_identity_trusted", {
    p_auth_user_id: user.id,
    p_reason: reason,
  });
  if (error) redirect(`/me?error=${encodeURIComponent(mapDatabaseError(error.message))}`);

  await supabase.auth.signOut({ scope: "local" });
  redirect("/login?success=line_unbound");
}

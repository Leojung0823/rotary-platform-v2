"use server";

import { randomBytes } from "node:crypto";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createTrustedAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { trustedSiteUrl } from "@/lib/site-url";
import { parseNewPassword, safeRedirectPath } from "@/lib/validation";

const invitationTokenPattern = /^[0-9a-f]{64}$/i;
const recoveryMarkerPattern = /^[0-9a-f]{48}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function joinErrorPath(token: string, code: string) {
  return `/join?token=${encodeURIComponent(token)}&error=${encodeURIComponent(code)}`;
}

export async function loginWithPasswordAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const returnTo = safeRedirectPath(String(formData.get("returnTo") ?? ""), "/dashboard");

  if (!email || !password) redirect(`/login?error=invalid_credentials&returnTo=${encodeURIComponent(returnTo)}`);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=invalid_credentials&returnTo=${encodeURIComponent(returnTo)}`);

  redirect(returnTo);
}

export async function signOutToLoginAction(formData: FormData) {
  const returnTo = safeRedirectPath(String(formData.get("returnTo") ?? ""), "/dashboard");
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (emailPattern.test(email)) {
    const callbackUrl = new URL("/auth/callback", trustedSiteUrl());
    callbackUrl.searchParams.set("next", "/reset-password");

    const supabase = await createClient();
    // Always show the same response. Supabase may deliberately suppress delivery
    // for unknown or rate-limited addresses.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: callbackUrl.toString(),
    });
  }

  redirect("/forgot-password?success=sent");
}

export async function confirmPasswordRecoveryAction(formData: FormData) {
  const siteUrl = trustedSiteUrl();
  const failureUrl = new URL("/login", siteUrl);
  failureUrl.searchParams.set("error", "recovery_invalid");

  const code = String(formData.get("code") ?? "").trim();
  const tokenHash = String(formData.get("tokenHash") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim() as EmailOtpType;
  const validCode = code.length > 0 && code.length <= 2048;
  const validToken = tokenHash.length > 0 && tokenHash.length <= 2048 && type === "recovery";
  if (!validCode && !validToken) redirect(failureUrl.toString());

  const supabase = await createClient();
  const result = validCode
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
  if (result.error) redirect(failureUrl.toString());

  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(failureUrl.toString());

  const store = await cookies();
  store.set("rotary_recovery", randomBytes(24).toString("hex"), {
    httpOnly: true,
    sameSite: "lax",
    secure: siteUrl.protocol === "https:",
    path: "/",
    maxAge: 15 * 60,
  });
  redirect(new URL("/reset-password", siteUrl).toString());
}

export async function resetPasswordAction(formData: FormData) {
  const store = await cookies();
  const recoveryMarker = store.get("rotary_recovery")?.value ?? "";
  if (!recoveryMarkerPattern.test(recoveryMarker)) redirect("/login?error=recovery_invalid");

  let password: string;
  try {
    password = parseNewPassword(formData);
  } catch {
    redirect("/reset-password?error=invalid_password");
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?error=recovery_invalid");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/reset-password?error=invalid_password");

  store.delete("rotary_recovery");
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login?success=password_updated");
}

export async function startPasswordMemberJoinAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!invitationTokenPattern.test(token)) redirect("/join?error=invitation_invalid");
  if (!emailPattern.test(email)) redirect(joinErrorPath(token, "invalid_email"));

  let password: string;
  try {
    password = parseNewPassword(formData);
  } catch {
    redirect(joinErrorPath(token, "invalid_password"));
  }

  const admin = createTrustedAdminClient();
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (created.error || !created.data.user) {
    redirect(joinErrorPath(token, "use_existing_account"));
  }

  const authUserId = created.data.user.id;
  const bound = await admin.rpc("bind_password_account_from_invitation_trusted", {
    p_token: token,
    p_auth_user_id: authUserId,
  });

  if (bound.error) {
    try {
      await admin.auth.admin.deleteUser(authUserId);
    } catch {
      // Best-effort rollback. The trusted RPC failed closed and did not accept the invite.
    }

    const code = bound.error.message.includes("email_mismatch")
      ? "invitation_email_mismatch"
      : bound.error.message.includes("invalid_or_expired")
        ? "invitation_invalid"
        : "use_existing_account";
    redirect(joinErrorPath(token, code));
  }

  const supabase = await createClient();
  const signedIn = await supabase.auth.signInWithPassword({ email, password });
  if (signedIn.error) redirect(joinErrorPath(token, "password_signin_failed"));

  redirect(`/join?token=${encodeURIComponent(token)}&success=password_ready`);
}

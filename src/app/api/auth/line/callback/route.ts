import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTrustedAdminClient } from "@/lib/supabase/admin";
import { exchangeLineCode, lineMode } from "@/lib/line/provider";
import { safeRedirectPath } from "@/lib/validation";

function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
function equals(a: string, b: string) { const left = Buffer.from(a); const right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); }

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin; const store = await cookies();
  const state = request.nextUrl.searchParams.get("state") ?? ""; const code = request.nextUrl.searchParams.get("code") ?? "";
  const expectedState = store.get("line_oauth_state")?.value ?? ""; const nonce = store.get("line_oauth_nonce")?.value ?? "";
  const invitationToken = store.get("line_invitation")?.value ?? "";
  const returnTo = safeRedirectPath(store.get("line_return_to")?.value, invitationToken ? "/join" : "/dashboard");
  const clear = () => ["line_oauth_state", "line_oauth_nonce", "line_invitation", "line_return_to"].forEach((name) => store.delete(name));
  try {
    if (!state || !code || !expectedState || !nonce || !equals(state, expectedState)) throw new Error("OAuth state mismatch.");
    const admin = createTrustedAdminClient();
    const stateResult = await admin.from("line_oauth_states")
      .select("id, nonce_hash, invitation_token_hash, return_path, expires_at, consumed_at")
      .eq("state_hash", digest(state)).maybeSingle();
    const persistedState = stateResult.data;
    if (stateResult.error || !persistedState || persistedState.consumed_at
      || new Date(persistedState.expires_at).getTime() <= Date.now()
      || !equals(persistedState.nonce_hash, digest(nonce))
      || persistedState.invitation_token_hash !== (invitationToken ? digest(invitationToken) : null)
      || persistedState.return_path !== returnTo) throw new Error("OAuth transaction expired or already used.");
    const consumed = await admin.from("line_oauth_states").update({ consumed_at: new Date().toISOString() })
      .eq("id", persistedState.id).is("consumed_at", null).select("id").maybeSingle();
    if (consumed.error || !consumed.data) throw new Error("OAuth transaction replayed.");
    const profile = await exchangeLineCode(code, nonce);
    let account: { id: string; person_id: string; auth_user_id: string; login_email: string } | null = null;
    let invitedPersonId: string | null = null;
    if (invitationToken) {
      const invitation = await admin.from("member_invitations").select("person_id").eq("token_hash", digest(invitationToken)).maybeSingle();
      if (invitation.error || !invitation.data) throw new Error("Invitation not found.");
      invitedPersonId = invitation.data.person_id;
      const accountResult = await admin.from("app_accounts").select("id, person_id, auth_user_id, login_email").eq("person_id", invitedPersonId).maybeSingle();
      if (accountResult.error) throw accountResult.error; account = accountResult.data;
    } else {
      const identity = await admin.from("line_identities").select("app_account_id").eq("provider_subject", profile.subject).eq("identity_status", "active").maybeSingle();
      if (identity.error) throw identity.error;
      if (identity.data) {
        const accountResult = await admin.from("app_accounts").select("id, person_id, auth_user_id, login_email").eq("id", identity.data.app_account_id).single();
        if (accountResult.error) throw accountResult.error; account = accountResult.data;
      }
    }
    let authUserId = account?.auth_user_id; let loginEmail = account?.login_email;
    if (!authUserId) {
      loginEmail = `line-${digest(profile.subject).slice(0, 24)}@identity.local`;
      const created = await admin.auth.admin.createUser({ email: loginEmail, email_confirm: true, user_metadata: { line_display_name: profile.displayName } });
      if (created.error || !created.data.user) throw created.error ?? new Error("Auth user creation failed.");
      authUserId = created.data.user.id;
      if (!invitationToken) {
        const personResult = await admin.from("people").insert({ canonical_name: profile.displayName, primary_email: profile.email ?? null,
          avatar_url: profile.pictureUrl ?? null }).select("id").single();
        if (personResult.error) throw personResult.error;
        const accountResult = await admin.from("app_accounts").insert({ auth_user_id: authUserId, person_id: personResult.data.id,
          login_email: loginEmail, account_display_name: profile.displayName }).select("id, person_id, auth_user_id, login_email").single();
        if (accountResult.error) throw accountResult.error; account = accountResult.data;
        const identityResult = await admin.from("line_identities").insert({ person_id: account.person_id, app_account_id: account.id,
          provider_subject: profile.subject, display_name: profile.displayName, picture_url: profile.pictureUrl ?? null,
          email: profile.email ?? null, last_login_at: new Date().toISOString() });
        if (identityResult.error) throw identityResult.error;
      }
    }
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email: loginEmail! });
    if (link.error || !link.data.properties.hashed_token) throw link.error ?? new Error("Session link failed.");
    const supabase = await createClient();
    const verified = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token });
    if (verified.error) throw verified.error;
    if (invitationToken) {
      const bound = await supabase.rpc("bind_line_identity_from_invitation", { p_token: invitationToken,
        p_provider_subject: profile.subject, p_display_name: profile.displayName,
        p_picture_url: profile.pictureUrl ?? null, p_email: profile.email ?? null });
      if (bound.error) throw bound.error;
    } else {
      await admin.from("line_identities").update({ display_name: profile.displayName, picture_url: profile.pictureUrl ?? null,
        email: profile.email ?? null, last_login_at: new Date().toISOString() }).eq("provider_subject", profile.subject).eq("identity_status", "active");
    }
    const deviceCookie = store.get("rotary_device")?.value ?? randomUUID();
    if (!store.get("rotary_device")) store.set("rotary_device", deviceCookie, { httpOnly: true, secure: process.env.APP_ENV === "production", sameSite: "lax", path: "/", maxAge: 31536000 });
    const requestHeaders = await headers();
    await supabase.rpc("record_login_and_device", { p_provider_key: lineMode() === "mock" ? "line_mock" : "line",
      p_device_fingerprint_hash: digest(deviceCookie), p_device_name: "Web 瀏覽器",
      p_user_agent: requestHeaders.get("user-agent") ?? null, p_ip_address: null });
    clear();
    const destination = invitationToken ? `/join?token=${encodeURIComponent(invitationToken)}` : returnTo;
    return NextResponse.redirect(`${origin}${destination}`);
  } catch {
    clear(); return NextResponse.redirect(`${origin}/login?error=line_login_failed`);
  }
}

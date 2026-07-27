import { createHash, randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { exchangeLineCode, lineMode } from "../../../../../lib/line/provider";
import {
  clearLineOAuthCookies,
  constantTimeEqual,
  lineLoginFailureUrl,
  lineOAuthCookieOptions,
  safeLineRedirectPath,
  trustedLineRedirectUrl,
} from "../../../../../lib/line/security";
import { createTrustedAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function loginFailure() {
  try {
    return NextResponse.redirect(lineLoginFailureUrl());
  } catch {
    return NextResponse.json({ error: "line_login_failed" }, {
      status: 500,
      headers: { "cache-control": "no-store" },
    });
  }
}

export async function GET(request: NextRequest) {
  const store = await cookies();
  let sessionClient: Awaited<ReturnType<typeof createClient>> | null = null;
  let sessionCreated = false;
  let adminClient: ReturnType<typeof createTrustedAdminClient> | null = null;
  let newlyCreatedInvitationAuthUserId: string | null = null;
  const fail = () => {
    clearLineOAuthCookies(store);
    return loginFailure();
  };

  try {
    const state = request.nextUrl.searchParams.get("state") ?? "";
    const code = request.nextUrl.searchParams.get("code") ?? "";
    const providerError = request.nextUrl.searchParams.has("error");
    const expectedState = store.get("line_oauth_state")?.value ?? "";
    const nonce = store.get("line_oauth_nonce")?.value ?? "";
    const invitationToken = store.get("line_invitation")?.value ?? "";
    const returnTo = safeLineRedirectPath(
      store.get("line_return_to")?.value,
      invitationToken ? "/join" : "/dashboard",
    );

    if (!state || state.length > 512 || !expectedState || expectedState.length > 512
      || !nonce || nonce.length > 512 || !constantTimeEqual(state, expectedState)) {
      throw new Error("LINE Login authorization response is invalid.");
    }

    adminClient = createTrustedAdminClient();
    const stateResult = await adminClient.from("line_oauth_states")
      .select("id, nonce_hash, invitation_token_hash, return_path, expires_at, consumed_at")
      .eq("state_hash", digest(state))
      .maybeSingle();
    const persistedState = stateResult.data;
    const now = new Date();
    if (stateResult.error || !persistedState || persistedState.consumed_at
      || new Date(persistedState.expires_at).getTime() <= now.getTime()
      || !constantTimeEqual(persistedState.nonce_hash, digest(nonce))
      || persistedState.invitation_token_hash !== (invitationToken ? digest(invitationToken) : null)
      || safeLineRedirectPath(persistedState.return_path, "") !== returnTo) {
      throw new Error("LINE Login authorization state is invalid.");
    }

    // The conditional update makes success, provider cancel, and provider
    // error terminal for this state. Replay and expiry both fail closed.
    const consumed = await adminClient.from("line_oauth_states")
      .update({ consumed_at: now.toISOString() })
      .eq("id", persistedState.id)
      .is("consumed_at", null)
      .gt("expires_at", now.toISOString())
      .select("id")
      .maybeSingle();
    if (consumed.error || !consumed.data) throw new Error("LINE Login authorization state was already consumed.");
    if (providerError || !code) throw new Error("LINE Login provider did not return an authorization code.");

    const profile = await exchangeLineCode(code, nonce);
    let account: { id: string; person_id: string; auth_user_id: string; login_email: string } | null = null;
    let invitedPersonId: string | null = null;

    if (invitationToken) {
      // Validate status and expiry before creating an Auth user. The database
      // binding RPC remains authoritative and rechecks these conditions under
      // row lock, while this preflight prevents known-invalid partial success.
      const invitation = await adminClient.from("member_invitations")
        .select("person_id, invitation_status, expires_at")
        .eq("token_hash", digest(invitationToken))
        .maybeSingle();
      if (invitation.error || !invitation.data
        || !["pending", "sent"].includes(invitation.data.invitation_status)
        || new Date(invitation.data.expires_at).getTime() <= Date.now()) {
        throw new Error("LINE Login invitation is invalid or expired.");
      }
      invitedPersonId = invitation.data.person_id;
      const accountResult = await adminClient.from("app_accounts")
        .select("id, person_id, auth_user_id, login_email")
        .eq("person_id", invitedPersonId)
        .maybeSingle();
      if (accountResult.error) throw new Error("LINE Login account lookup failed.");
      account = accountResult.data;
    } else {
      const identity = await adminClient.from("line_identities")
        .select("app_account_id")
        .eq("provider_subject", profile.subject)
        .eq("identity_status", "active")
        .maybeSingle();
      if (identity.error) throw new Error("LINE Login identity lookup failed.");
      if (identity.data) {
        const accountResult = await adminClient.from("app_accounts")
          .select("id, person_id, auth_user_id, login_email")
          .eq("id", identity.data.app_account_id)
          .single();
        if (accountResult.error) throw new Error("LINE Login account lookup failed.");
        account = accountResult.data;
      }
    }

    let authUserId = account?.auth_user_id;
    let loginEmail = account?.login_email;
    if (!authUserId) {
      loginEmail = `line-${digest(profile.subject).slice(0, 24)}@identity.local`;
      const created = await adminClient.auth.admin.createUser({
        email: loginEmail,
        email_confirm: true,
        user_metadata: { line_display_name: profile.displayName },
      });
      if (created.error || !created.data.user) throw new Error("LINE Login Auth user creation failed.");
      authUserId = created.data.user.id;
      if (invitationToken) newlyCreatedInvitationAuthUserId = authUserId;

      if (!invitationToken) {
        const personResult = await adminClient.from("people").insert({
          canonical_name: profile.displayName,
          primary_email: profile.email ?? null,
          avatar_url: profile.pictureUrl ?? null,
        }).select("id").single();
        if (personResult.error) throw new Error("LINE Login person creation failed.");

        const accountResult = await adminClient.from("app_accounts").insert({
          auth_user_id: authUserId,
          person_id: personResult.data.id,
          login_email: loginEmail,
          account_display_name: profile.displayName,
        }).select("id, person_id, auth_user_id, login_email").single();
        if (accountResult.error) throw new Error("LINE Login account creation failed.");
        account = accountResult.data;

        const identityResult = await adminClient.from("line_identities").insert({
          person_id: account.person_id,
          app_account_id: account.id,
          provider_subject: profile.subject,
          display_name: profile.displayName,
          picture_url: profile.pictureUrl ?? null,
          email: profile.email ?? null,
          last_login_at: new Date().toISOString(),
        });
        if (identityResult.error) throw new Error("LINE Login identity creation failed.");
      }
    }

    const link = await adminClient.auth.admin.generateLink({ type: "magiclink", email: loginEmail! });
    if (link.error || !link.data.properties.hashed_token) throw new Error("LINE Login session link creation failed.");
    sessionClient = await createClient();
    const verified = await sessionClient.auth.verifyOtp({
      type: "magiclink",
      token_hash: link.data.properties.hashed_token,
    });
    if (verified.error) throw new Error("LINE Login session creation failed.");
    sessionCreated = true;

    if (invitationToken) {
      const bound = await sessionClient.rpc("bind_line_identity_from_invitation", {
        p_token: invitationToken,
        p_provider_subject: profile.subject,
        p_display_name: profile.displayName,
        p_picture_url: profile.pictureUrl ?? null,
        p_email: profile.email ?? null,
      });
      if (bound.error) throw new Error("LINE Login invitation binding failed.");
    } else {
      const updated = await adminClient.from("line_identities").update({
        display_name: profile.displayName,
        picture_url: profile.pictureUrl ?? null,
        email: profile.email ?? null,
        last_login_at: new Date().toISOString(),
      }).eq("provider_subject", profile.subject).eq("identity_status", "active");
      if (updated.error) throw new Error("LINE Login identity update failed.");
    }

    const deviceCookie = store.get("rotary_device")?.value ?? randomUUID();
    if (!store.get("rotary_device")) {
      store.set("rotary_device", deviceCookie, lineOAuthCookieOptions(31_536_000));
    }
    const requestHeaders = await headers();
    const recorded = await sessionClient.rpc("record_login_and_device", {
      p_provider_key: lineMode() === "mock" ? "line_mock" : "line",
      p_device_fingerprint_hash: digest(deviceCookie),
      p_device_name: "Web 瀏覽器",
      p_user_agent: requestHeaders.get("user-agent") ?? null,
      p_ip_address: null,
    });
    if (recorded.error) throw new Error("LINE Login device recording failed.");

    clearLineOAuthCookies(store);
    const destination = invitationToken
      ? `/join?token=${encodeURIComponent(invitationToken)}`
      : returnTo;
    return NextResponse.redirect(trustedLineRedirectUrl(destination));
  } catch {
    if (sessionCreated && sessionClient) {
      try {
        await sessionClient.auth.signOut({ scope: "local" });
      } catch {
        // The public result remains generic.
      }
    }

    if (newlyCreatedInvitationAuthUserId && adminClient) {
      try {
        const linkedAccount = await adminClient.from("app_accounts")
          .select("id")
          .eq("auth_user_id", newlyCreatedInvitationAuthUserId)
          .maybeSingle();
        if (!linkedAccount.error && !linkedAccount.data) {
          await adminClient.auth.admin.deleteUser(newlyCreatedInvitationAuthUserId);
        }
      } catch {
        // Cleanup is best-effort and never changes the generic public result.
      }
    }

    return fail();
  }
}

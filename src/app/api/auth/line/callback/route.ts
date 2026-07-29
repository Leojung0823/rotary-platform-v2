import { createHash, randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { exchangeLineCode, lineMode } from "@/lib/line/provider";
import {
  clearLineOAuthCookies,
  constantTimeEqual,
  lineLoginFailureUrl,
  lineOAuthCookieOptions,
  safeLineRedirectPath,
  trustedLineRedirectUrl,
  type LineOAuthFlow,
} from "@/lib/line/security";
import { createTrustedAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

type Account = {
  id: string;
  person_id: string;
  auth_user_id: string | null;
  login_email: string | null;
  account_status: string;
};

type InvitationBinding = {
  invitation_kind?: string;
  invitation_completed?: boolean;
};

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

function parseFlow(value: string): LineOAuthFlow {
  if (value === "login" || value === "invitation" || value === "bind") return value;
  throw new Error("LINE Login flow is invalid.");
}

export async function GET(request: NextRequest) {
  const store = await cookies();
  let sessionClient: Awaited<ReturnType<typeof createClient>> | null = null;
  let sessionCreated = false;
  let createdAuthUserId: string | null = null;
  let trustedBindingCompleted = false;

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
    const flow = parseFlow(store.get("line_flow")?.value ?? "");
    const returnTo = safeLineRedirectPath(
      store.get("line_return_to")?.value,
      flow === "invitation" ? "/join" : flow === "bind" ? "/me" : "/dashboard",
    );

    if (!state || state.length > 512 || !expectedState || expectedState.length > 512
      || !nonce || nonce.length > 512 || !constantTimeEqual(state, expectedState)) {
      throw new Error("LINE Login authorization response is invalid.");
    }
    if ((flow === "invitation") !== Boolean(invitationToken)) {
      throw new Error("LINE Login flow does not match invitation state.");
    }

    const admin = createTrustedAdminClient();
    const stateResult = await admin
      .from("line_oauth_states")
      .select("id, nonce_hash, invitation_token_hash, return_path, flow_kind, initiating_auth_user_id, expires_at, consumed_at")
      .eq("state_hash", digest(state))
      .maybeSingle();
    const persistedState = stateResult.data;
    const now = new Date();
    if (stateResult.error || !persistedState || persistedState.consumed_at
      || new Date(persistedState.expires_at).getTime() <= now.getTime()
      || !constantTimeEqual(persistedState.nonce_hash, digest(nonce))
      || persistedState.invitation_token_hash !== (invitationToken ? digest(invitationToken) : null)
      || persistedState.flow_kind !== flow
      || safeLineRedirectPath(persistedState.return_path, "") !== returnTo) {
      throw new Error("LINE Login authorization state is invalid.");
    }

    sessionClient = await createClient();
    if (flow === "bind") {
      const { data: currentUser } = await sessionClient.auth.getUser();
      if (!currentUser.user || currentUser.user.id !== persistedState.initiating_auth_user_id) {
        throw new Error("LINE binding session no longer matches its initiator.");
      }
    } else if (persistedState.initiating_auth_user_id) {
      throw new Error("Unexpected LINE Login initiator state.");
    }

    const consumed = await admin
      .from("line_oauth_states")
      .update({ consumed_at: now.toISOString() })
      .eq("id", persistedState.id)
      .is("consumed_at", null)
      .gt("expires_at", now.toISOString())
      .select("id")
      .maybeSingle();
    if (consumed.error || !consumed.data) {
      throw new Error("LINE Login authorization state was already consumed.");
    }
    if (providerError || !code) {
      throw new Error("LINE Login provider did not return an authorization code.");
    }

    const profile = await exchangeLineCode(code, nonce);

    if (flow === "bind") {
      const bound = await admin.rpc("bind_line_identity_to_existing_account_trusted", {
        p_auth_user_id: persistedState.initiating_auth_user_id,
        p_provider_subject: profile.subject,
        p_display_name: profile.displayName,
        p_picture_url: profile.pictureUrl ?? null,
        p_email: profile.email ?? null,
      });
      if (bound.error) throw new Error("LINE Login existing-account binding failed.");

      clearLineOAuthCookies(store);
      return NextResponse.redirect(trustedLineRedirectUrl("/me?success=line_bound"));
    }

    let account: Account | null = null;
    let invitationKind: string | null = null;

    if (flow === "invitation") {
      const invitation = await admin
        .from("member_invitations")
        .select("person_id, invitation_kind, invitation_status, expires_at")
        .eq("token_hash", digest(invitationToken))
        .maybeSingle();
      if (invitation.error || !invitation.data
        || !["pending", "sent"].includes(invitation.data.invitation_status)
        || new Date(invitation.data.expires_at).getTime() <= Date.now()) {
        throw new Error("LINE Login invitation is invalid or expired.");
      }
      invitationKind = invitation.data.invitation_kind;

      const accountResult = await admin
        .from("app_accounts")
        .select("id, person_id, auth_user_id, login_email, account_status")
        .eq("person_id", invitation.data.person_id)
        .maybeSingle();
      if (accountResult.error) throw new Error("LINE Login account lookup failed.");
      account = accountResult.data;
      if (account && account.account_status !== "active") {
        throw new Error("LINE Login account is not active.");
      }
      if (invitationKind === "line_rebind" && (!account?.auth_user_id || !account.login_email)) {
        throw new Error("LINE Login rebind requires an existing account.");
      }
    } else {
      const identity = await admin
        .from("line_identities")
        .select("app_account_id")
        .eq("provider_subject", profile.subject)
        .eq("identity_status", "active")
        .maybeSingle();
      if (identity.error || !identity.data) {
        throw new Error("Invitation or existing LINE identity is required.");
      }

      const accountResult = await admin
        .from("app_accounts")
        .select("id, person_id, auth_user_id, login_email, account_status")
        .eq("id", identity.data.app_account_id)
        .single();
      if (accountResult.error || accountResult.data.account_status !== "active"
        || !accountResult.data.auth_user_id || !accountResult.data.login_email) {
        throw new Error("LINE Login account is not active.");
      }
      account = accountResult.data;

      const access = await admin.rpc("account_has_active_access", {
        p_app_account_id: account.id,
      });
      if (access.error || access.data !== true) {
        throw new Error("LINE Login account has no active access.");
      }
    }

    let authUserId = account?.auth_user_id ?? null;
    let loginEmail = account?.login_email ?? null;
    if (!authUserId) {
      if (flow !== "invitation" || invitationKind !== "member_join") {
        throw new Error("Valid member invitation is required to create an Auth user.");
      }
      loginEmail = `line-${digest(profile.subject).slice(0, 24)}@identity.local`;
      const created = await admin.auth.admin.createUser({
        email: loginEmail,
        email_confirm: true,
        user_metadata: { line_display_name: profile.displayName },
      });
      if (created.error || !created.data.user) {
        throw new Error("LINE Login Auth user creation failed.");
      }
      authUserId = created.data.user.id;
      createdAuthUserId = authUserId;
    }
    if (!loginEmail) throw new Error("LINE Login account email is unavailable.");

    if (flow === "invitation") {
      const bound = await admin.rpc("bind_line_identity_from_invitation_trusted", {
        p_token: invitationToken,
        p_auth_user_id: authUserId,
        p_provider_subject: profile.subject,
        p_display_name: profile.displayName,
        p_picture_url: profile.pictureUrl ?? null,
        p_email: profile.email ?? null,
      });
      if (bound.error) throw new Error("LINE Login invitation binding failed.");
      trustedBindingCompleted = true;
      const binding = bound.data as InvitationBinding | null;
      invitationKind = binding?.invitation_kind ?? invitationKind;
    } else {
      const refreshed = await admin
        .from("line_identities")
        .update({
          display_name: profile.displayName,
          picture_url: profile.pictureUrl ?? null,
          email: profile.email ?? null,
          last_login_at: new Date().toISOString(),
        })
        .eq("provider_subject", profile.subject)
        .eq("identity_status", "active");
      if (refreshed.error) throw new Error("LINE Login identity refresh failed.");
    }

    const link = await admin.auth.admin.generateLink({ type: "magiclink", email: loginEmail });
    if (link.error || !link.data.properties.hashed_token) {
      throw new Error("LINE Login session link creation failed.");
    }

    const verified = await sessionClient.auth.verifyOtp({
      type: "magiclink",
      token_hash: link.data.properties.hashed_token,
    });
    if (verified.error) throw new Error("LINE Login session creation failed.");
    sessionCreated = true;

    const deviceCookie = store.get("rotary_device")?.value ?? randomUUID();
    if (!store.get("rotary_device")) {
      store.set("rotary_device", deviceCookie, lineOAuthCookieOptions(31_536_000));
    }

    const requestHeaders = await headers();
    // Device logging is useful telemetry, but must not invalidate an established session.
    await sessionClient.rpc("record_login_and_device", {
      p_provider_key: lineMode() === "mock" ? "line_mock" : "line",
      p_device_fingerprint_hash: digest(deviceCookie),
      p_device_name: "Web 瀏覽器",
      p_user_agent: requestHeaders.get("user-agent") ?? null,
      p_ip_address: null,
    });

    clearLineOAuthCookies(store);
    const destination = invitationKind === "line_rebind"
      ? "/me?success=line_rebound"
      : flow === "invitation"
        ? `/join?token=${encodeURIComponent(invitationToken)}`
        : returnTo;
    return NextResponse.redirect(trustedLineRedirectUrl(destination));
  } catch {
    if (sessionCreated && sessionClient) {
      try {
        await sessionClient.auth.signOut({ scope: "local" });
      } catch {
        // Best-effort rollback of a newly established local session.
      }
    }
    if (createdAuthUserId && !trustedBindingCompleted) {
      try {
        await createTrustedAdminClient().auth.admin.deleteUser(createdAuthUserId);
      } catch {
        // Best-effort cleanup. The callback still fails closed.
      }
    }
    return fail();
  }
}

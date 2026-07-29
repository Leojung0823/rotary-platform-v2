import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createLineAuthorizationUrl, createOAuthSecrets } from "../../../../../lib/line/provider";
import {
  clearLineOAuthCookies,
  lineLoginFailureUrl,
  safeLineRedirectPath,
  setLineOAuthCookies,
  type LineOAuthFlow,
} from "../../../../../lib/line/security";
import { createTrustedAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const invitationPattern = /^[0-9a-f]{64}$/i;

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
  try {
    const invitation = request.nextUrl.searchParams.get("invite")?.trim() ?? "";
    if (invitation && !invitationPattern.test(invitation)) {
      throw new Error("LINE Login invitation input is invalid.");
    }

    const requestedFlow = request.nextUrl.searchParams.get("flow")?.trim() ?? "";
    if (requestedFlow && requestedFlow !== "bind") {
      throw new Error("LINE Login flow is invalid.");
    }

    const flow: LineOAuthFlow = invitation ? "invitation" : requestedFlow === "bind" ? "bind" : "login";
    let initiatingAuthUserId: string | null = null;

    if (flow === "bind") {
      const supabase = await createClient();
      const [{ data: userData }, access] = await Promise.all([
        supabase.auth.getUser(),
        supabase.rpc("current_account_has_active_access"),
      ]);
      if (!userData.user || access.error || access.data !== true) {
        throw new Error("Authenticated active account is required for LINE binding.");
      }
      initiatingAuthUserId = userData.user.id;
    }

    const { state, nonce } = createOAuthSecrets();
    const defaultReturn = flow === "invitation" ? "/join" : flow === "bind" ? "/me" : "/dashboard";
    const returnTo = safeLineRedirectPath(
      request.nextUrl.searchParams.get("returnTo"),
      defaultReturn,
    );

    // Validate provider configuration before durable state or cookies are created.
    const authorizationUrl = createLineAuthorizationUrl(state, nonce);
    const admin = createTrustedAdminClient();
    const persisted = await admin.from("line_oauth_states").insert({
      state_hash: digest(state),
      nonce_hash: digest(nonce),
      invitation_token_hash: invitation ? digest(invitation) : null,
      return_path: returnTo,
      flow_kind: flow,
      initiating_auth_user_id: initiatingAuthUserId,
    });
    if (persisted.error) throw new Error("LINE Login state persistence failed.");

    setLineOAuthCookies(store, { state, nonce, invitation, returnTo, flow });
    return NextResponse.redirect(authorizationUrl);
  } catch {
    clearLineOAuthCookies(store);
    return loginFailure();
  }
}

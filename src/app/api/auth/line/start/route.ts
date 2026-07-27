import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createLineAuthorizationUrl, createOAuthSecrets } from "../../../../../lib/line/provider";
import {
  clearLineOAuthCookies,
  lineLoginFailureUrl,
  safeLineRedirectPath,
  setLineOAuthCookies,
} from "../../../../../lib/line/security";
import { createTrustedAdminClient } from "@/lib/supabase/admin";

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
    const { state, nonce } = createOAuthSecrets();
    const invitation = request.nextUrl.searchParams.get("invite") ?? "";
    if (invitation.length > 4_096) throw new Error("LINE Login invitation input is invalid.");
    const returnTo = safeLineRedirectPath(
      request.nextUrl.searchParams.get("returnTo"),
      invitation ? "/join" : "/dashboard",
    );

    // Provider configuration, including the production mock boundary, is
    // validated before durable state or browser cookies are created.
    const authorizationUrl = createLineAuthorizationUrl(state, nonce);
    const admin = createTrustedAdminClient();
    const persisted = await admin.from("line_oauth_states").insert({
      state_hash: digest(state),
      nonce_hash: digest(nonce),
      invitation_token_hash: invitation ? digest(invitation) : null,
      return_path: returnTo,
    });
    if (persisted.error) throw new Error("LINE Login state persistence failed.");

    setLineOAuthCookies(store, { state, nonce, invitation, returnTo });
    return NextResponse.redirect(authorizationUrl);
  } catch {
    clearLineOAuthCookies(store);
    return loginFailure();
  }
}

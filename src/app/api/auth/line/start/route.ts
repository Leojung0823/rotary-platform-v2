import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createLineAuthorizationUrl, createOAuthSecrets } from "@/lib/line/provider";
import { createTrustedAdminClient } from "@/lib/supabase/admin";
import { safeRedirectPath } from "@/lib/validation";

const invitationPattern = /^[0-9a-f]{64}$/i;

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function GET(request: NextRequest) {
  const invitation = request.nextUrl.searchParams.get("invite")?.trim() ?? "";
  if (invitation && !invitationPattern.test(invitation)) {
    return NextResponse.redirect(new URL("/login?error=line_login_failed", request.url));
  }

  const { state, nonce } = createOAuthSecrets();
  const returnTo = safeRedirectPath(
    request.nextUrl.searchParams.get("returnTo"),
    invitation ? "/join" : "/dashboard",
  );
  const secure = process.env.APP_ENV === "production";
  const store = await cookies();
  const admin = createTrustedAdminClient();
  const persisted = await admin.from("line_oauth_states").insert({
    state_hash: digest(state),
    nonce_hash: digest(nonce),
    invitation_token_hash: invitation ? digest(invitation) : null,
    return_path: returnTo,
  });
  if (persisted.error) {
    return NextResponse.redirect(new URL("/login?error=line_login_failed", request.url));
  }

  const options = { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: 600 };
  store.set("line_oauth_state", state, options);
  store.set("line_oauth_nonce", nonce, options);
  store.set("line_invitation", invitation, options);
  store.set("line_return_to", returnTo, options);
  return NextResponse.redirect(createLineAuthorizationUrl(state, nonce));
}

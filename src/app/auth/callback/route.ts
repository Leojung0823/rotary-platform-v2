import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { trustedSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/validation";

const allowedOtpTypes = new Set<EmailOtpType>([
  "email",
  "recovery",
  "invite",
  "email_change",
  "signup",
  "magiclink",
]);

function failure(siteUrl: URL) {
  const target = new URL("/login", siteUrl);
  target.searchParams.set("error", "recovery_invalid");
  return NextResponse.redirect(target);
}

function recoveryConfirmation(siteUrl: URL, {
  code,
  tokenHash,
  type,
}: {
  code: string | null;
  tokenHash: string | null;
  type: EmailOtpType | null;
}) {
  const target = new URL("/auth/recovery/confirm", siteUrl);
  if (code) target.searchParams.set("code", code);
  else if (tokenHash && type) {
    target.searchParams.set("token_hash", tokenHash);
    target.searchParams.set("type", type);
  }
  target.searchParams.set("next", "/reset-password");

  const response = NextResponse.redirect(target);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: NextRequest) {
  // Resolve the external origin before Auth work and never derive a redirect
  // from the proxy-facing request URL or forwarded host headers.
  const siteUrl = trustedSiteUrl();
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const next = safeRedirectPath(request.nextUrl.searchParams.get("next"), "/dashboard");

  const hasCode = Boolean(code);
  const hasAllowedToken = Boolean(tokenHash && type && allowedOtpTypes.has(type));
  if (!hasCode && !hasAllowedToken) return failure(siteUrl);

  // Email security scanners commonly prefetch links. Exchanging a recovery
  // code during this GET would consume the one-time credential before the
  // member ever sees the page. Recovery therefore stops at an app-owned
  // confirmation screen; only the member's explicit POST performs Auth work.
  if (next === "/reset-password") {
    return recoveryConfirmation(siteUrl, { code, tokenHash, type });
  }

  const supabase = await createClient();

  let error: unknown = null;
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type && allowedOtpTypes.has(type)) {
    ({ error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash }));
  }

  if (error) return failure(siteUrl);

  const { data } = await supabase.auth.getUser();
  if (!data.user) return failure(siteUrl);

  const destination = new URL(next, siteUrl);
  return NextResponse.redirect(destination);
}

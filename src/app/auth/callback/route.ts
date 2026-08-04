import { randomBytes } from "node:crypto";
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

export async function GET(request: NextRequest) {
  // Resolve the external origin before Auth work and never derive a redirect
  // from the proxy-facing request URL or forwarded host headers.
  const siteUrl = trustedSiteUrl();
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const next = safeRedirectPath(request.nextUrl.searchParams.get("next"), "/dashboard");
  const supabase = await createClient();

  let error: unknown = null;
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type && allowedOtpTypes.has(type)) {
    ({ error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash }));
  } else {
    return failure(siteUrl);
  }

  if (error) return failure(siteUrl);

  const { data } = await supabase.auth.getUser();
  if (!data.user) return failure(siteUrl);

  const destination = new URL(next, siteUrl);
  const response = NextResponse.redirect(destination);
  if (next === "/reset-password") {
    response.cookies.set("rotary_recovery", randomBytes(24).toString("hex"), {
      httpOnly: true,
      sameSite: "lax",
      secure: destination.protocol === "https:",
      path: "/",
      maxAge: 15 * 60,
    });
  }
  return response;
}

"use server";

import { redirect } from "next/navigation";
import { signMockAuthorization } from "@/lib/line/provider";

export async function authorizeMockLineAction(formData: FormData) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  if (!["localhost", "127.0.0.1"].includes(new URL(siteUrl).hostname)) throw new Error("Mock LINE Login is local-only.");
  const state = String(formData.get("state") ?? ""); const nonce = String(formData.get("nonce") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!state || !nonce || displayName.length < 2 || !/^U[a-zA-Z0-9_-]{8,64}$/.test(subject)) redirect("/login?error=line_login_failed");
  const code = signMockAuthorization({ subject, displayName, email: email || undefined }, nonce);
  redirect(`/api/auth/line/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);
}

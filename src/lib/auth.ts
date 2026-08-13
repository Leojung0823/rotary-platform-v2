import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Identity = {
  id: string;
  person_id: string;
  display_name: string;
  email: string;
  status: string;
  platform_roles: string[];
};

// LINE-only accounts get a synthetic placeholder auth.users email
// (line-<hash>@identity.local, see lineIdentityLoginEmail) since Supabase
// Auth requires some email even without password/real-email login. It's an
// internal implementation detail, not something to surface in the UI.
export function displayableEmail(identity: Pick<Identity, "email">): string | null {
  return identity.email.endsWith("@identity.local") ? null : identity.email;
}

export async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function resolveIdentity(): Promise<Identity> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) redirect("/login");

  const [{ data, error }, access] = await Promise.all([
    supabase.rpc("resolve_current_app_account"),
    supabase.rpc("current_account_has_active_access"),
  ]);
  if (error || !data) redirect("/invite/accept");

  const identity = data as Identity;
  if (identity.status !== "active") redirect("/access-denied?reason=account_inactive");
  if (access.error || access.data !== true) redirect("/access-denied?reason=no_active_access");
  return identity;
}

// Authenticated layouts and their pages often request the same identity. React's
// request cache keeps that work to one claims check and one pair of account RPCs.
export const requireIdentity = cache(resolveIdentity);

export function hasPlatformAccess(identity: Identity) {
  return identity.status === "active"
    && identity.platform_roles.some((role) => role === "superadmin" || role === "platform_admin");
}

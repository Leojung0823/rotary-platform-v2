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

export async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function requireIdentity(): Promise<Identity> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

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

export function hasPlatformAccess(identity: Identity) {
  return identity.status === "active"
    && identity.platform_roles.some((role) => role === "superadmin" || role === "platform_admin");
}

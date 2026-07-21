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
  const { data, error } = await supabase.rpc("resolve_current_app_account");
  if (error || !data) redirect("/invite/accept");
  return data as Identity;
}

export function hasPlatformAccess(identity: Identity) {
  return identity.platform_roles.some((role) => role === "superadmin" || role === "platform_admin");
}

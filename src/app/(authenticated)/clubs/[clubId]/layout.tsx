import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireIdentity } from "@/lib/auth";
import { isManagementMode } from "@/lib/experience-context";
import { currentExperienceMode } from "@/lib/experience-mode.server";

/** Every /clubs/:clubId child is a club-management surface. */
export default async function ClubManagementLayout({ children }: { children: ReactNode }) {
  const identity = await requireIdentity();
  const headerStore = await headers();
  if (headerStore.get("x-rotary-requested-mode") !== "management") redirect("/access-denied");
  const mode = await currentExperienceMode(identity.id);
  // A disabled or unavailable role-shell projection must preserve the legacy
  // route. The child page and its RPC/RLS checks remain the authority; the
  // layout only prevents a member-mode URL from rendering a management page.
  //
  // Platform mode passes for the same reason. current_has_club_permission
  // grants superadmin and platform_admin every club permission in its first
  // clause, so the database has always allowed this -- the layout was refusing
  // something the rule permits, and the platform console links straight here
  // with a 管理社員 button. A platform admin was being shown a door and then
  // told it was not theirs.
  if (mode !== null && !isManagementMode(mode) && mode !== "platform") redirect("/access-denied");
  return children;
}

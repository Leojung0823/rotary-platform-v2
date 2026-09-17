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
  // Platform mode passes too. A platform admin now carries every club in their
  // management context -- resolve_my_experience_context reads the platform role,
  // the way current_has_club_permission always has -- so they arrive here
  // through the club switcher like anyone else. The mode they arrive in is
  // still their own, and it is not member mode.
  if (mode !== null && !isManagementMode(mode) && mode !== "platform") redirect("/access-denied");
  return children;
}

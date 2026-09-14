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
  if (!isManagementMode(mode)) redirect("/access-denied");
  return children;
}

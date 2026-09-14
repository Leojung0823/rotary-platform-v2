import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireIdentity } from "@/lib/auth";
import { isManagementMode } from "@/lib/experience-context";
import { currentExperienceMode } from "@/lib/experience-mode.server";
import { resolveExperienceContext } from "@/lib/experience-context.server";

export const dynamic = "force-dynamic";

/**
 * Keep old bookmarks working while making management mode the only place that
 * can render the editor. The canonical route checks the club id and the RPC
 * checks the permission again, so this compatibility redirect is not an auth
 * boundary.
 */
export default async function LegacyServicePlanEditPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const query = await searchParams;
  const identity = await requireIdentity();
  const headerStore = await headers();
  if (headerStore.get("x-rotary-requested-mode") !== "management") {
    redirect("/access-denied");
  }
  const mode = await currentExperienceMode(identity.id);
  // When role shells are unavailable, keep the old permission-only fallback;
  // otherwise a resolved member mode must never render this management editor.
  if (mode !== null && !isManagementMode(mode)) {
    redirect("/access-denied");
  }
  const resolution = await resolveExperienceContext(null);
  const activeClubId = resolution.ok ? resolution.context.activeClubId : null;
  if (!activeClubId) redirect("/access-denied");

  const canonicalQuery = new URLSearchParams({ mode: "management" });
  if (query.year && /^\d{4}$/u.test(query.year)) canonicalQuery.set("year", query.year);
  redirect(`/clubs/${encodeURIComponent(activeClubId)}/service-plan?${canonicalQuery.toString()}`);
}

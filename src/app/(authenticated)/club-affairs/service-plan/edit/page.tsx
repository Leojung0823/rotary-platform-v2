import { redirect } from "next/navigation";
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
  const resolution = await resolveExperienceContext(null);
  const activeClubId = resolution.ok ? resolution.context.activeClubId : null;
  if (!activeClubId) redirect("/access-denied");

  const canonicalQuery = new URLSearchParams({ mode: "management" });
  if (query.year && /^\d{4}$/u.test(query.year)) canonicalQuery.set("year", query.year);
  redirect(`/clubs/${encodeURIComponent(activeClubId)}/service-plan?${canonicalQuery.toString()}`);
}

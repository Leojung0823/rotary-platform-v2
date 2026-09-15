import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { MemberPortal } from "@/components/member-portal/member-portal";
import { Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { activeClubCookieName, readActiveClubPreference } from "@/lib/experience-context-cookie";
import { activeClubForMode } from "@/lib/experience-context";
import { resolveExperienceContext } from "@/lib/experience-context.server";
import { signCoverImageUrls } from "@/lib/events/cover-image.server";
import { resolveMemberHomeProjection } from "@/lib/member-home.server";
import { APP_TIME_ZONE } from "@/lib/time";
import {
  announcementsFrom,
  featuredEventFrom,
  tasksFrom,
  upcomingEventsFrom,
} from "@/lib/member-portal/from-projection";

// A preview of the desktop portal against this member's real club, so it can
// be checked on staging before it replaces the member home. Production never
// serves it.
export const dynamic = "force-dynamic";

const todayDate = new Intl.DateTimeFormat("zh-TW", { timeZone: APP_TIME_ZONE, month: "long", day: "numeric" });
const todayWeekday = new Intl.DateTimeFormat("zh-TW", { timeZone: APP_TIME_ZONE, weekday: "long" });

export default async function MemberHomePreviewPage() {
  if (process.env.APP_ENV === "production") notFound();

  const cookieStore = await cookies();
  const identity = await requireIdentity();
  const contextResolution = await resolveExperienceContext(
    readActiveClubPreference(cookieStore.get(activeClubCookieName)?.value),
  );
  if (!contextResolution.ok) return <Notice tone="error">目前無法載入社別資料，請稍後重新整理。</Notice>;
  const club = activeClubForMode(contextResolution.context, "member");
  if (!club) return <Notice tone="error">請先選擇一個社，再回到這個頁面。</Notice>;

  const resolution = await resolveMemberHomeProjection(club.clubId);
  if (!resolution.ok) return <Notice tone="error">目前無法載入社員首頁資料，請稍後重新整理。</Notice>;
  const { projection } = resolution;

  const covers = await signCoverImageUrls([projection.primaryEvent?.coverImagePath]);
  const now = new Date();

  return <MemberPortal
    member={{ displayName: identity.display_name, initial: identity.display_name.slice(0, 1) }}
    club={{ name: club.clubName }}
    today={{ date: todayDate.format(now), weekday: todayWeekday.format(now) }}
    featuredEvent={projection.primaryEvent === null
      ? null
      : featuredEventFrom(projection.primaryEvent, covers.get(projection.primaryEvent.coverImagePath ?? ""))}
    upcomingEvents={upcomingEventsFrom(projection.upcomingEvents)}
    tasks={tasksFrom(projection.pendingTasks)}
    announcements={announcementsFrom(projection, club.clubId)}
  />;
}

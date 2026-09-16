import { Suspense } from "react";
import { Notice } from "@/components/ui";
import { MemberLineOaOnboarding, MemberLineOaOnboardingLoading } from "@/components/member-line-oa-onboarding";
import { signCoverImageUrls } from "@/lib/events/cover-image.server";
import { resolveMemberHomeProjection } from "@/lib/member-home.server";
import { APP_TIME_ZONE } from "@/lib/time";
import type { Identity } from "@/lib/auth";
import type { ClubContext } from "@/lib/experience-context";
import {
  announcementsFrom,
  entriesFrom,
  featuredEventFrom,
  tasksFrom,
  upcomingEventsFrom,
} from "@/lib/member-portal/from-projection";
import { MemberPortalBody, MemberPortalHeader, MemberPortalShell } from "./member-portal";
import { NotificationBellItems, NotificationBellLoading } from "./notification-bell-items";

const todayDate = new Intl.DateTimeFormat("zh-TW", { timeZone: APP_TIME_ZONE, month: "long", day: "numeric" });
const todayWeekday = new Intl.DateTimeFormat("zh-TW", { timeZone: APP_TIME_ZONE, weekday: "long" });

type Features = Readonly<{
  messageCentre: boolean;
  blessingIou: boolean;
  duesFinance: boolean;
  lineOaOnboarding: boolean;
}>;

/**
 * The bell's contents. Its own boundary, so the greeting still paints before
 * the projection arrives -- resolveMemberHomeProjection is React-cached, so
 * asking for it here and in the body is one database round trip.
 */
async function BellNotifications({
  clubId,
  messageCentre,
}: {
  clubId: string;
  messageCentre: boolean;
}) {
  const resolution = await resolveMemberHomeProjection(clubId);
  return <NotificationBellItems
    items={resolution.ok && messageCentre ? announcementsFrom(resolution.projection, clubId) : []}
  />;
}

/** Everything that has to wait for the projection. */
async function PortalBody({
  activeClub,
  features,
  messagesHref,
}: {
  activeClub: Pick<ClubContext, "clubId" | "clubName">;
  features: Features;
  messagesHref: string;
}) {
  const resolution = await resolveMemberHomeProjection(activeClub.clubId);
  if (!resolution.ok) {
    return <Notice tone="error">目前無法載入社員首頁資料，請稍後重新整理。</Notice>;
  }

  const { projection } = resolution;
  const covers = await signCoverImageUrls([projection.primaryEvent?.coverImagePath]);

  return <MemberPortalBody
    featuredEvent={projection.primaryEvent === null
      ? null
      : featuredEventFrom(projection.primaryEvent, covers.get(projection.primaryEvent.coverImagePath ?? ""))}
    upcomingEvents={upcomingEventsFrom(projection.upcomingEvents)}
    tasks={tasksFrom(projection.pendingTasks)}
    announcements={features.messageCentre ? announcementsFrom(projection, activeClub.clubId) : []}
    messagesHref={messagesHref}
    entries={entriesFrom(activeClub.clubId, features)}
  >
    {features.lineOaOnboarding && <Suspense fallback={<MemberLineOaOnboardingLoading />}>
      <MemberLineOaOnboarding clubId={activeClub.clubId} />
    </Suspense>}
  </MemberPortalBody>;
}

/**
 * The member home. The greeting needs no data, so it is painted first and the
 * rest streams in behind it -- this is the first page after signing in, and
 * blocking all of it on one database round trip delays every pixel.
 *
 * The application shell already provides the navigation, so this renders the
 * page and nothing around it.
 */
export function MemberPortalHome({
  identity,
  activeClub,
  features,
}: {
  identity: Identity;
  activeClub: Pick<ClubContext, "clubId" | "clubName">;
  features: Features;
}) {
  const now = new Date();
  // One place decides where the message centre is: the header's bell footer,
  // the notices card's 查看全部 and the body all point at the same URL.
  const messagesHref = `/messages?clubId=${encodeURIComponent(activeClub.clubId)}&mode=member`;
  return <MemberPortalShell>
    <MemberPortalHeader
      member={{ displayName: identity.display_name, initial: identity.display_name.slice(0, 1) }}
      today={{ date: todayDate.format(now), weekday: todayWeekday.format(now) }}
      // No message centre for this club means no bell: a control that leads
      // nowhere is worse than an empty corner.
      messagesHref={features.messageCentre ? messagesHref : null}
      bell={<Suspense fallback={<NotificationBellLoading />}>
        <BellNotifications clubId={activeClub.clubId} messageCentre={features.messageCentre} />
      </Suspense>}
    />
    <Suspense fallback={<MemberPortalBodyLoading />}>
      <PortalBody activeClub={activeClub} features={features} messagesHref={messagesHref} />
    </Suspense>
  </MemberPortalShell>;
}

function MemberPortalBodyLoading() {
  return <section aria-busy="true" aria-live="polite">
    <span className="sr-only">正在載入今天的活動</span>
    <div className="skeleton-card">
      <span className="skeleton skeleton-eyebrow" />
      <span className="skeleton skeleton-card-title" />
      <span className="skeleton skeleton-copy skeleton-copy-wide" />
    </div>
  </section>;
}

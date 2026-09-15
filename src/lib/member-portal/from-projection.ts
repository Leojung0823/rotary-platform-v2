import { APP_TIME_ZONE } from "@/lib/time";
import { memberHomePrimaryAction } from "@/lib/member-home";
import { pendingTaskUrgency } from "@/lib/member-home/pending-task-urgency";
import type {
  MemberHomeEvent,
  MemberHomePendingTask,
  MemberHomeProjection,
  MemberHomeUpcomingEvent,
} from "@/lib/member-home";
import type {
  PortalAnnouncement,
  PortalFeaturedEvent,
  PortalTask,
  PortalUpcomingEvent,
} from "./types";

const dateTime = new Intl.DateTimeFormat("zh-TW", {
  timeZone: APP_TIME_ZONE,
  month: "long", day: "numeric", weekday: "short",
  hour: "2-digit", minute: "2-digit", hour12: false,
});
const dayOnly = new Intl.DateTimeFormat("zh-TW", { timeZone: APP_TIME_ZONE, day: "numeric" });
const monthOnly = new Intl.DateTimeFormat("zh-TW", { timeZone: APP_TIME_ZONE, month: "long" });
const weekdayTime = new Intl.DateTimeFormat("zh-TW", {
  timeZone: APP_TIME_ZONE, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
});
const isoDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});

/** The hero's state, narrowed to the four the portal draws. */
function heroRegistration(event: MemberHomeEvent): PortalFeaturedEvent["registration"] {
  switch (event.registrationState) {
    case "registered": return "registered";
    case "registration_closed": return "closed";
    case "declined": return "closed";
    default: return "not_registered";
  }
}

export function featuredEventFrom(
  event: MemberHomeEvent,
  coverUrl: string | undefined,
): PortalFeaturedEvent {
  return {
    title: event.title,
    // The projection carries no separate summary, and inventing one would put
    // words in an organiser's mouth. The card simply omits it.
    summary: "",
    startsAt: dateTime.format(new Date(event.startsAt)),
    venue: event.location || "地點待確認",
    venueAddress: "",
    checkinNote: memberHomePrimaryAction(event).label === "前往簽到" ? "開放簽到" : "本活動不需簽到",
    coverUrl: coverUrl ?? null,
    registration: heroRegistration(event),
  };
}

export function upcomingEventsFrom(
  events: readonly MemberHomeUpcomingEvent[],
): readonly PortalUpcomingEvent[] {
  return events.map((event) => {
    const at = new Date(event.startsAt);
    return {
      month: monthOnly.format(at),
      day: dayOnly.format(at),
      title: event.title,
      when: weekdayTime.format(at),
      state: event.registrationState === "registered"
        ? "registered"
        : event.registrationState === "open" ? "open" : "closed",
    };
  });
}

export function tasksFrom(tasks: readonly MemberHomePendingTask[]): readonly PortalTask[] {
  return tasks.map((task) => {
    const urgency = pendingTaskUrgency(task);
    return {
      icon: "bell" as const,
      title: "回覆活動報名",
      detail: task.title,
      status: urgency.label,
      tone: urgency.tone,
      href: "/events",
    };
  });
}

export function announcementsFrom(
  projection: MemberHomeProjection,
  clubId: string,
): readonly PortalAnnouncement[] {
  return projection.notifications.items.map((item) => ({
    date: isoDay.format(new Date(item.publishedAt)),
    title: item.title,
    summary: item.bodyPreview,
    unread: item.unread,
    href: item.actionPath ?? `/messages?clubId=${encodeURIComponent(clubId)}`,
  }));
}

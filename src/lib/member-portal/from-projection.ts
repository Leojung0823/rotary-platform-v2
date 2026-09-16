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
  PortalEntry,
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
    case "declined": return "declined";
    case "registration_closed": return "closed";
    default: return "not_registered";
  }
}

/**
 * Every state has its own sentence. "本活動不需簽到" used to stand in for all
 * four of the others, which told a member waiting for check-in to open that
 * there would never be any -- and once an event outside the attendance rate
 * can take check-ins too, "not_available" stops being the common case.
 */
function checkinNoteFor(state: MemberHomeEvent["checkinState"]): string {
  if (state === "available") return "開放簽到";
  if (state === "checked_in") return "已完成簽到";
  if (state === "not_open") return "簽到尚未開始";
  if (state === "closed") return "簽到已結束";
  return "本活動不需簽到";
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
    checkinNote: checkinNoteFor(event.checkinState),
    coverUrl: coverUrl ?? null,
    registration: heroRegistration(event),
    // The projection's own rule, which knows about check-in as well as
    // registration. The card must not work this out a second way.
    action: memberHomePrimaryAction(event),
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

/**
 * The ways into features the home page is the only route to, each behind the
 * same flag that gated it before. A member whose club has a feature switched
 * off does not see a door to it.
 */
export function entriesFrom(
  clubId: string,
  features: Readonly<{ messageCentre: boolean; blessingIou: boolean; duesFinance: boolean }>,
): readonly PortalEntry[] {
  const club = encodeURIComponent(clubId);
  const entries: PortalEntry[] = [];
  if (features.messageCentre) {
    entries.push({ icon: "chat", title: "訊息中心", detail: "查看幹部發送給您的社內訊息", href: "/messages?mode=member" });
  }
  if (features.blessingIou) {
    entries.push({ icon: "heart", title: "祝福 IOU", detail: "分享祝福，也可以留下希望捐贈的金額", href: `/blessings?clubId=${club}&mode=member` });
  }
  if (features.duesFinance) {
    entries.push({ icon: "coins", title: "我的社費", detail: "查看自己的應收、收款與代墊狀態", href: `/dues?clubId=${club}&mode=member` });
  }
  return entries;
}

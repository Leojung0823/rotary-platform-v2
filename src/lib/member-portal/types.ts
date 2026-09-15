// The portal's own shapes. The components take these and nothing else, so the
// page can be fed by the projection, and could be fed by anything else.

export type PortalMember = Readonly<{ displayName: string; initial: string }>;
export type PortalClub = Readonly<{ name: string }>;

export type PortalRegistrationState = "not_registered" | "registered" | "open" | "closed";

export type PortalFeaturedEvent = Readonly<{
  title: string;
  /** Empty when the organiser wrote none; the card omits the line. */
  summary: string;
  startsAt: string;
  venue: string;
  venueAddress: string;
  checkinNote: string;
  coverUrl: string | null;
  registration: PortalRegistrationState;
}>;

export type PortalUpcomingEvent = Readonly<{
  month: string;
  day: string;
  title: string;
  when: string;
  state: PortalRegistrationState;
}>;

export type PortalTask = Readonly<{
  icon: "bell" | "document" | "user";
  title: string;
  detail: string;
  status: string | null;
  tone: "danger" | "neutral" | "chevron";
  href: string;
}>;

export type PortalAnnouncement = Readonly<{
  date: string;
  title: string;
  summary: string;
  /** Read state is the one thing a member cannot work out by looking. */
  unread: boolean;
  href: string;
}>;

export const registrationLabels: Record<PortalRegistrationState, string> = {
  not_registered: "尚未報名",
  registered: "已報名",
  open: "開放報名",
  closed: "報名截止",
};

/** The call to action follows the member's own state, never a fixed string. */
export function featuredEventAction(state: PortalRegistrationState): { label: string; href: string } {
  return state === "not_registered" || state === "open"
    ? { label: "立即報名", href: "/events" }
    : { label: "查看活動", href: "/events" };
}

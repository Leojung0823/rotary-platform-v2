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
  /**
   * Where the card sends a member, worked out from their own state -- which
   * includes whether check-in is open. Deriving it from the registration state
   * alone loses that, and with it the only way home offers to check in.
   */
  action: Readonly<{ label: string; href: string }>;
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

/**
 * A way into a feature that the home page is the only route to. The reference
 * design does not show these, but a design omitting them is not a reason to
 * remove the only path a member has to the message centre, their dues or the
 * blessing board.
 */
export type PortalEntry = Readonly<{
  icon: "chat" | "heart" | "coins";
  title: string;
  detail: string;
  href: string;
}>;

import type { ClubEvent } from "@/lib/events/page-contract";

/**
 * The reason one event is not offering location check-in.
 *
 * Ordered by how early the condition fails, so each event is described by the
 * first thing standing in the way rather than by all of them at once.
 */
export type LocationCheckinBlocker = Readonly<{
  eventId: string;
  title: string;
  reason: "no_venue" | "too_early" | "too_late" | "should_be_open";
}>;

const HOUR = 60 * 60 * 1000;

/** How far ahead an event is still worth explaining. */
const LOOK_AHEAD_DAYS = 7;

/**
 * Why nothing is on offer, per event.
 *
 * Only published events the member can see, within a week either side -- an
 * event next month is not what someone standing at a venue is asking about.
 *
 * `should_be_open` is what is left when every condition checks out. Location
 * check-in no longer waits for an officer to open a session -- it is open for
 * the length of the window -- so an event in this state is one the member
 * should be able to check into, and seeing it here means something else is
 * wrong. Saying that plainly beats sending them to find an officer.
 */
export function locationCheckinBlockers(
  events: readonly ClubEvent[],
  now: Date,
): readonly LocationCheckinBlocker[] {
  const at = now.getTime();
  return events
    .filter((event) => event.status === "published")
    .filter((event) => {
      const starts = new Date(event.starts_at).getTime();
      const ends = new Date(event.ends_at).getTime();
      if (Number.isNaN(starts) || Number.isNaN(ends)) return false;
      return ends > at - LOOK_AHEAD_DAYS * 24 * HOUR && starts < at + LOOK_AHEAD_DAYS * 24 * HOUR;
    })
    .map((event) => {
      const starts = new Date(event.starts_at).getTime();
      const ends = new Date(event.ends_at).getTime();
      // The venue first: without coordinates the window never matters, and
      // telling someone to wait for a window that will never open is worse than
      // telling them nothing.
      if (!event.venue_location_set) {
        return { eventId: event.id, title: event.title, reason: "no_venue" as const };
      }
      if (at < starts - HOUR) {
        return { eventId: event.id, title: event.title, reason: "too_early" as const };
      }
      if (at > ends + HOUR) {
        return { eventId: event.id, title: event.title, reason: "too_late" as const };
      }
      return { eventId: event.id, title: event.title, reason: "should_be_open" as const };
    })
    .sort((left, right) => {
      // What is actionable now first: a session someone can open, then the
      // clock, then the events that will never offer it.
      const rank = { should_be_open: 0, too_early: 1, no_venue: 2, too_late: 3 };
      return rank[left.reason] - rank[right.reason];
    })
    .slice(0, 6);
}

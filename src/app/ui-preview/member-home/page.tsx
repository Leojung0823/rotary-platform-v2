import { notFound } from "next/navigation";
import { MemberPortal } from "@/components/member-portal/member-portal";
import {
  mockAnnouncements,
  mockClub,
  mockFeaturedEvent,
  mockMember,
  mockTasks,
  mockToday,
  mockUpcomingEvents,
} from "@/lib/member-portal/mock";

// A local preview of the desktop portal, driven by fixed sample data so the
// layout can be worked on and screenshot without a database. It is not part of
// the product: production never serves it.
export const dynamic = "force-dynamic";

export default function MemberHomePreviewPage() {
  if (process.env.APP_ENV === "production") notFound();

  return <MemberPortal
    member={mockMember}
    club={mockClub}
    today={mockToday}
    featuredEvent={mockFeaturedEvent}
    upcomingEvents={mockUpcomingEvents}
    tasks={mockTasks}
    announcements={mockAnnouncements}
  />;
}

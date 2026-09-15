// Stage one is visual fidelity, so the portal is driven by a fixed sample of
// the shapes the real projection already returns. The component props are the
// contract; swapping this for `resolveMemberHomeProjection` is the only change
// stage two needs.

export type PortalMember = Readonly<{ displayName: string; initial: string }>;
export type PortalClub = Readonly<{ name: string }>;

export type RegistrationState = "not_registered" | "registered" | "open" | "closed";

export type PortalFeaturedEvent = Readonly<{
  title: string;
  summary: string;
  startsAt: string;
  venue: string;
  venueAddress: string;
  checkinNote: string;
  coverUrl: string;
  registration: RegistrationState;
}>;

export type PortalUpcomingEvent = Readonly<{
  month: string;
  day: string;
  title: string;
  when: string;
  state: RegistrationState | "coming_soon";
}>;

export type PortalTask = Readonly<{
  icon: "bell" | "document" | "user";
  title: string;
  detail: string;
  status: string | null;
  tone: "danger" | "neutral" | "chevron";
}>;

export type PortalAnnouncement = Readonly<{
  date: string;
  title: string;
  summary: string;
  dot: "green" | "blue" | "amber";
}>;

export const registrationLabels: Record<RegistrationState | "coming_soon", string> = {
  not_registered: "尚未報名",
  registered: "已報名",
  open: "開放報名",
  closed: "報名截止",
  coming_soon: "敬請期待",
};

// The call to action follows the member's own state, never a fixed string.
export function featuredEventAction(state: RegistrationState): { label: string; href: string } {
  switch (state) {
    case "registered": return { label: "查看活動", href: "/events" };
    case "closed": return { label: "查看活動", href: "/events" };
    default: return { label: "立即報名", href: "/events" };
  }
}

export const mockMember: PortalMember = { displayName: "LEO", initial: "L" };
export const mockClub: PortalClub = { name: "板橋群英扶輪社" };

export const mockFeaturedEvent: PortalFeaturedEvent = {
  title: "PP Ian 博士榮耀誌慶｜與社友共享喜悅",
  summary: "誠摯邀請社友共襄一堂，共享這份榮耀與喜悅。",
  startsAt: "9月29日 週二 18:00",
  venue: "傳藝古早味懷舊餐廳",
  venueAddress: "台北市松山區敦化南路一段7-1號",
  checkinNote: "本活動不需簽到",
  coverUrl: "/ui-preview/featured-event.webp",
  registration: "not_registered",
};

export const mockUpcomingEvents: readonly PortalUpcomingEvent[] = [
  { month: "9月", day: "29", title: "PP Ian 博士榮耀誌慶", when: "週二 18:00", state: "not_registered" },
  { month: "10月", day: "12", title: "十月例會", when: "週六 12:00", state: "open" },
  { month: "10月", day: "25", title: "社區服務活動", when: "週五 09:00", state: "coming_soon" },
];

export const mockTasks: readonly PortalTask[] = [
  { icon: "bell", title: "回覆活動報名", detail: "PP Ian 博士榮耀誌慶", status: "即將截止", tone: "danger" },
  { icon: "document", title: "繳交社費", detail: "2025 下半年度", status: "尚餘 7 天", tone: "neutral" },
  { icon: "user", title: "更新個人資料", detail: "完善您的社員資料", status: null, tone: "chevron" },
];

export const mockAnnouncements: readonly PortalAnnouncement[] = [
  { date: "2025-09-20", title: "十月份例會會地點異動公告", summary: "因場地調整，十月份例會將於新地點舉行…", dot: "green" },
  { date: "2025-09-15", title: "扶輪公益行動｜捐血活動圓滿成功", summary: "感謝所有社友的熱情參與，讓愛心持續傳遞…", dot: "blue" },
  { date: "2025-09-10", title: "2025-26 年度社費繳交提醒", summary: "敬請各位社友於 9/30 前完成繳交…", dot: "amber" },
];

export const mockToday = { date: "9月24日", weekday: "週三" };

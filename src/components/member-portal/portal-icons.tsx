import type { ReactNode } from "react";

// One icon set for the whole portal, drawn at one weight and inheriting
// currentColor. The specification forbids mixing styles, so every glyph the
// page needs lives here rather than being reached for from elsewhere.
export type PortalIconName =
  | "home" | "calendar" | "chat" | "users" | "building" | "user"
  | "search" | "bell" | "chevronDown" | "chevronRight" | "arrowRight"
  | "sparkle" | "pin" | "clipboard" | "document" | "megaphone" | "checkSquare";

const paths: Record<PortalIconName, ReactNode> = {
  home: <><path d="M4 10.5 12 4l8 6.5" /><path d="M6 9.8V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.8" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3.4v3.2M16 3.4v3.2" /></>,
  chat: <><path d="M4 5.8A1.8 1.8 0 0 1 5.8 4h12.4A1.8 1.8 0 0 1 20 5.8v8.4a1.8 1.8 0 0 1-1.8 1.8H9l-5 4Z" /></>,
  users: <><circle cx="9" cy="8.4" r="3.2" /><path d="M3.4 19.4c.6-3 2.9-4.7 5.6-4.7s5 1.7 5.6 4.7" /><path d="M16 5.6a3.2 3.2 0 0 1 0 6.1M17.6 14.9c2.1.5 3.4 2 3.9 4.5" /></>,
  building: <><rect x="4.5" y="3.6" width="15" height="16.8" rx="2" /><path d="M8.6 7.6h2M13.4 7.6h2M8.6 11.6h2M13.4 11.6h2M10 20.4v-4h4v4" /></>,
  user: <><circle cx="12" cy="8" r="3.6" /><path d="M4.8 20c.7-3.6 3.6-5.6 7.2-5.6s6.5 2 7.2 5.6" /></>,
  search: <><circle cx="11" cy="11" r="6.4" /><path d="m15.8 15.8 4 4" /></>,
  bell: <><path d="M12 3.6a5.5 5.5 0 0 0-5.5 5.5c0 4.1-1.2 5.5-2 6.3h15c-.8-.8-2-2.2-2-6.3A5.5 5.5 0 0 0 12 3.6Z" /><path d="M10.2 18.4a2 2 0 0 0 3.6 0" /></>,
  chevronDown: <path d="m7 10 5 5 5-5" />,
  chevronRight: <path d="m10 7 5 5-5 5" />,
  arrowRight: <><path d="M5 12h13" /><path d="m12.5 6 6 6-6 6" /></>,
  sparkle: <path d="M12 3.4 13.7 9l5.6 1.7-5.6 1.7L12 18l-1.7-5.6L4.7 10.7 10.3 9Z" />,
  pin: <><path d="M12 20.8s6.6-5.1 6.6-10.4a6.6 6.6 0 1 0-13.2 0C5.4 15.7 12 20.8 12 20.8Z" /><circle cx="12" cy="10" r="2.5" /></>,
  clipboard: <><rect x="5.4" y="4.6" width="13.2" height="15.4" rx="2.2" /><path d="M9 4.6V3.4h6v1.2" /><path d="m9.2 12.4 2 2 3.6-3.8" /></>,
  document: <><path d="M6.4 3.8h7.2l4 4v12.4H6.4Z" /><path d="M13.4 3.8v4.2h4.2M9.2 13h5.6M9.2 16.2h4" /></>,
  megaphone: <><path d="M4 10.4v3.2a1.6 1.6 0 0 0 1.6 1.6h1.8L14 19.6V4.4L7.4 8.8H5.6A1.6 1.6 0 0 0 4 10.4Z" /><path d="M17.4 9.2a4 4 0 0 1 0 5.6" /></>,
  checkSquare: <><rect x="4.2" y="4.2" width="15.6" height="15.6" rx="3.4" /><path d="m8.6 12.2 2.4 2.4 4.6-4.8" /></>,
};

export function PortalIcon({ name, size = 20 }: { name: PortalIconName; size?: number }) {
  return <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >{paths[name]}</svg>;
}

import type { ReactNode } from "react";

// Inline line-art icons rather than text glyphs. The previous ⌂ ◇ ✓ set was
// rendered by whatever font the device happened to have, so stroke weight and
// baseline varied between Android and iOS and some glyphs (％, ↩) never matched
// the rest at all. These are drawn at a fixed weight, inherit currentColor so
// the light and dark themes and the per-mode accent all keep working, and are
// part of the bundle -- the artifact CSP forbids fetching icons from anywhere.

export type ShellIconName =
  | "home"
  | "calendar"
  | "chart"
  | "users"
  | "chat"
  | "gear"
  | "user"
  | "userPlus"
  | "heart"
  | "arrowLeft"
  | "building"
  | "plus"
  | "bell";

const paths: Record<ShellIconName, ReactNode> = {
  bell: <>
    <path d="M12 3.4a5.6 5.6 0 0 0-5.6 5.6c0 4.2-1.3 5.6-2 6.4h15.2c-.7-.8-2-2.2-2-6.4A5.6 5.6 0 0 0 12 3.4Z" />
    <path d="M10.1 18.4a2 2 0 0 0 3.8 0" />
  </>,
  home: <>
    <path d="M3.5 10.2 12 3.8l8.5 6.4" />
    <path d="M5.6 9v10.2h12.8V9" />
    <path d="M9.8 19.2v-5.4h4.4v5.4" />
  </>,
  calendar: <>
    <rect x="3.4" y="5.2" width="17.2" height="15.2" rx="2.6" />
    <path d="M3.4 9.9h17.2" />
    <path d="M8.2 3.6v3.2M15.8 3.6v3.2" />
    <path d="M7.6 13.6h3M13.4 13.6h3M7.6 16.9h3" />
  </>,
  chart: <>
    <path d="M4 20.2h16.4" />
    <rect x="5.2" y="12.6" width="3.6" height="7.6" rx="1.1" />
    <rect x="10.4" y="8.4" width="3.6" height="11.8" rx="1.1" />
    <rect x="15.6" y="4.4" width="3.6" height="15.8" rx="1.1" />
  </>,
  users: <>
    <circle cx="9.4" cy="8.4" r="3.4" />
    <path d="M3.4 19.6c0-3.2 2.7-5.4 6-5.4s6 2.2 6 5.4" />
    <path d="M16.2 5.4a3.2 3.2 0 0 1 0 6.1" />
    <path d="M17.6 14.6c1.9.7 3.1 2.3 3.1 4.4" />
  </>,
  chat: <>
    <path d="M3.6 7.2A2.6 2.6 0 0 1 6.2 4.6h8.6a2.6 2.6 0 0 1 2.6 2.6v4.8a2.6 2.6 0 0 1-2.6 2.6H9.4L5.6 17.4v-2.8h.6a2.6 2.6 0 0 1-2.6-2.6Z" />
    <path d="M17.4 8.6h1.2a2.4 2.4 0 0 1 2.4 2.4v4.4a2.4 2.4 0 0 1-2.4 2.4h-.4v2.4l-3-2.4h-3" />
  </>,
  gear: <>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M12 2.9v2.4M12 18.7v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.9 12h2.4M18.7 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7" />
  </>,
  user: <>
    <circle cx="12" cy="8.2" r="3.8" />
    <path d="M4.8 20.2c0-3.7 3.2-6.2 7.2-6.2s7.2 2.5 7.2 6.2" />
  </>,
  userPlus: <>
    <circle cx="9.6" cy="8.2" r="3.6" />
    <path d="M3.4 20c0-3.5 2.8-5.9 6.2-5.9 1.3 0 2.5.3 3.5.9" />
    <path d="M17.4 13.6v6M14.4 16.6h6" />
  </>,
  heart: <>
    <path d="M12 20.2C6.9 16.6 4 13.8 4 10.6a4.1 4.1 0 0 1 7.3-2.6l.7.9.7-.9A4.1 4.1 0 0 1 20 10.6c0 3.2-2.9 6-8 9.6Z" />
  </>,
  arrowLeft: <>
    <path d="M20 12H4.6" />
    <path d="m10.4 5.9-5.8 6.1 5.8 6.1" />
  </>,
  building: <>
    <path d="M4.4 20.2V6.4L12 3.4l7.6 3v13.8" />
    <path d="M3.2 20.2h17.6" />
    <path d="M8.4 9.6h1.8M13.8 9.6h1.8M8.4 13.4h1.8M13.8 13.4h1.8" />
    <path d="M10.2 20.2v-3.6h3.6v3.6" />
  </>,
  plus: <>
    <path d="M12 4.8v14.4M4.8 12h14.4" />
  </>,
};

export function ShellIcon({ name }: { name: ShellIconName }) {
  return <svg
    viewBox="0 0 24 24"
    width="22"
    height="22"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {paths[name]}
  </svg>;
}

export function isShellIconName(value: string): value is ShellIconName {
  return value in paths;
}

import type { AdjustmentType } from "./validation";

export type AttendanceStatus =
  | "present"
  | "makeup"
  | "official_leave"
  | "leave"
  | "exempt"
  | "absent";

export const attendanceStatusLabels: Record<AttendanceStatus, string> = {
  present: "出席",
  makeup: "補出席",
  official_leave: "公假",
  leave: "請假",
  exempt: "免計",
  absent: "缺席",
};

export const adjustmentTypeLabels: Record<AdjustmentType, string> = {
  leave: "請假",
  official_leave: "公假",
  makeup: "補出席",
  exempt: "免計",
};

export const checkinMethodLabels: Record<string, string> = {
  qr: "QR 掃碼",
  location: "定位簽到",
  manual: "人工補登",
  self: "本人簽到",
};

export function attendanceStatusBadge(status: string) {
  if (status === "present" || status === "makeup") return "badge badge-success";
  if (status === "absent") return "badge badge-danger";
  if (status === "exempt") return "badge badge-neutral";
  return "badge badge-warning";
}

/**
 * The database returns the rate as a fraction. It is rendered to one decimal
 * place because Rotary clubs report attendance to that precision.
 */
export function formatAttendanceRate(rate: number | null | undefined) {
  if (typeof rate !== "number" || !Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

export function formatAttendanceDate(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function formatAttendanceDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

/** "2026-07" as returned by the trend series, rendered for a Taiwanese reader. */
export function formatTrendPeriod(period: string) {
  const match = /^(\d{4})-(\d{2})$/u.exec(period);
  if (!match) return period;
  return `${match[1]} 年 ${Number(match[2])} 月`;
}

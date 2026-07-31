export const attendanceStatusLabels: Record<string, string> = {
  present: "已出席",
  makeup: "補出席",
  official_leave: "公假",
  leave: "請假",
  exempt: "免計",
  absent: "缺席",
};

export const adjustmentTypeLabels: Record<string, string> = {
  makeup: "補出席",
  official_leave: "公假",
  leave: "請假",
  exempt: "免計",
};

export function attendanceBadge(status: string) {
  if (status === "present" || status === "makeup") return "badge badge-success";
  if (status === "official_leave" || status === "exempt") return "badge badge-neutral";
  if (status === "leave") return "badge badge-warning";
  return "badge badge-danger";
}

export function formatAttendanceDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

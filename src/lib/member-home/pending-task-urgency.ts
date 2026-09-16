import type { MemberHomePendingTask } from "@/lib/member-home";

/**
 * How soon "soon" is. The projection returns hours remaining and nothing else,
 * so this threshold is a product decision that lives here and can change
 * without touching the database.
 */
export const urgentWithinHours = 72;

export type PendingTaskUrgency = Readonly<{
  label: string;
  tone: "danger" | "neutral";
}>;

/**
 * Null for a task with no deadline.
 *
 * Unpaid dues carry no due date in this schema, and nothing goes wrong if a
 * profile is never completed. Those rows get no countdown at all rather than a
 * borrowed one -- a reminder that cannot be late must not be able to say
 * 「即將截止」.
 */
export function pendingTaskUrgency(task: MemberHomePendingTask): PendingTaskUrgency | null {
  if (task.hoursRemaining === null) return null;
  if (task.hoursRemaining < urgentWithinHours) return { label: "即將截止", tone: "danger" };

  // Whole days, rounded down, so a member who reads "尚餘 1 天" and acts
  // tomorrow is still in time. Rounding up would say that about something
  // closing in sixty-one minutes.
  const days = Math.floor(task.hoursRemaining / 24);
  return { label: `尚餘 ${days} 天`, tone: "neutral" };
}

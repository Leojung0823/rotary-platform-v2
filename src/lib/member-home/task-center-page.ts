import type { MemberTaskPage } from "@/lib/member-home";
import { tasksFrom } from "@/lib/member-portal/from-projection";
import type { PortalTask } from "@/lib/member-portal/types";

export const memberTaskPageSize = 20;

export type MemberTaskCenterSlice = Readonly<{
  tasks: readonly PortalTask[];
  totalCount: number;
  pageNumber: number;
  pageCount: number;
  previousOffset: number | null;
  nextOffset: number | null;
}>;

/**
 * LINE onboarding comes from its own member-scoped RPC. Reserve one row on the
 * first page when it is actionable, while keeping the database page canonical
 * and the rest of the offsets stable.
 */
export function memberTaskCenterSlice(
  page: MemberTaskPage,
  lineOaTask: PortalTask | null,
): MemberTaskCenterSlice {
  const includeLineOaTask = page.offset === 0 && lineOaTask !== null;
  const databaseTasks = includeLineOaTask ? page.tasks.slice(0, memberTaskPageSize - 1) : page.tasks;
  const tasks = [
    ...tasksFrom(databaseTasks, { compactEventTitles: false }),
    ...(includeLineOaTask && lineOaTask ? [lineOaTask] : []),
  ];
  const totalCount = page.totalCount + (lineOaTask ? 1 : 0);
  const nextOffset = includeLineOaTask
    ? page.totalCount > memberTaskPageSize - 1 ? memberTaskPageSize - 1 : null
    : page.nextOffset;
  const pageNumber = page.offset === 0 ? 1 : Math.floor((page.offset + 1) / memberTaskPageSize) + 1;

  return {
    tasks,
    totalCount,
    pageNumber,
    pageCount: Math.max(1, Math.ceil(totalCount / memberTaskPageSize)),
    previousOffset: page.offset === 0 ? null : Math.max(0, page.offset === memberTaskPageSize - 1
      ? 0
      : page.offset - memberTaskPageSize),
    nextOffset,
  };
}

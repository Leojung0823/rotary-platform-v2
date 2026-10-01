import { describe, expect, it } from "vitest";
import type { MemberTaskPage } from "@/lib/member-home";
import type { PortalTask } from "@/lib/member-portal/types";
import { memberTaskCenterSlice } from "./task-center-page";

function page(offset: number, totalCount: number, count: number): MemberTaskPage {
  return {
    clubId: "a1000000-0000-4000-8000-000000000001",
    offset,
    pageSize: 20,
    totalCount,
    nextOffset: offset + 20 < totalCount ? offset + 20 : null,
    tasks: Array.from({ length: count }, (_, index) => ({
      taskId: `task-${offset + index}`,
      kind: "event_response",
      title: `活動 ${offset + index}`,
      detail: "",
      actionPath: "/events",
      deadline: "2026-10-02T10:00:00.000Z",
      hoursRemaining: 24,
      count: null,
    })),
  };
}

const lineTask: PortalTask = {
  id: "line-oa-onboarding",
  icon: "bell",
  title: "加入本社 LINE OA",
  detail: "加入後可接收本社重要通知",
  status: null,
  tone: "neutral",
  href: "/me/line-oa",
};

describe("member task-center pages", () => {
  it("reserves one first-page slot for the LINE task without skipping database tasks", () => {
    const first = memberTaskCenterSlice(page(0, 42, 20), lineTask);
    const second = memberTaskCenterSlice(page(19, 42, 20), lineTask);
    const third = memberTaskCenterSlice(page(39, 42, 3), lineTask);

    expect(first.tasks).toHaveLength(20);
    expect(first.tasks.at(-1)?.id).toBe("line-oa-onboarding");
    expect(first.nextOffset).toBe(19);
    expect(second.tasks).toHaveLength(20);
    expect(second.previousOffset).toBe(0);
    expect(second.nextOffset).toBe(39);
    expect(third.previousOffset).toBe(19);
    expect(third.pageNumber).toBe(3);
    expect(third.nextOffset).toBeNull();
    expect(new Set([...first.tasks, ...second.tasks, ...third.tasks].map((task) => task.id)).size).toBe(43);
  });

  it("does not create an empty second page when the first page fits", () => {
    const result = memberTaskCenterSlice(page(0, 19, 19), lineTask);
    expect(result.tasks).toHaveLength(20);
    expect(result.totalCount).toBe(20);
    expect(result.pageCount).toBe(1);
    expect(result.nextOffset).toBeNull();
  });

  it("does not repeat the separately projected LINE task on later pages", () => {
    const result = memberTaskCenterSlice(page(19, 22, 3), lineTask);
    expect(result.tasks.map((task) => task.id)).toEqual(["task-19", "task-20", "task-21"]);
    expect(result.totalCount).toBe(23);
  });
});

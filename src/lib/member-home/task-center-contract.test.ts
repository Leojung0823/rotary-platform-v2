import { describe, expect, it } from "vitest";
import { parseMemberTaskPage } from "@/lib/member-home";

const clubId = "a1000000-0000-4000-8000-000000000001";

function task(overrides: Record<string, unknown> = {}) {
  return {
    task_id: "b2000000-0000-4000-8000-000000000001",
    kind: "event_response",
    title: "本週例會",
    detail: "",
    action_path: `/events?clubId=${clubId}&mode=member`,
    deadline: "2026-10-05T10:00:00.000Z",
    hours_remaining: 72,
    count: null,
    ...overrides,
  };
}

function page(overrides: Record<string, unknown> = {}) {
  return {
    club_id: clubId,
    offset: 0,
    page_size: 20,
    total_count: 1,
    next_offset: null,
    tasks: [task()],
    ...overrides,
  };
}

describe("member pending task page contract", () => {
  const expected = { clubId, offset: 0, pageSize: 20 };

  it("accepts only the requested club and page", () => {
    expect(parseMemberTaskPage(page(), expected)).toMatchObject({
      clubId,
      offset: 0,
      pageSize: 20,
      totalCount: 1,
      tasks: [{ taskId: task().task_id }],
    });
    expect(parseMemberTaskPage(page({ club_id: "a1000000-0000-4000-8000-000000000002" }), expected)).toBeNull();
    expect(parseMemberTaskPage(page({ offset: 20 }), expected)).toBeNull();
    expect(parseMemberTaskPage(page({ page_size: 10 }), expected)).toBeNull();
  });

  it("requires pagination metadata to match the total and page bounds", () => {
    expect(parseMemberTaskPage(page({ total_count: 22, next_offset: 20 }), expected)?.nextOffset).toBe(20);
    expect(parseMemberTaskPage(page({ total_count: 22, next_offset: null }), expected)).toBeNull();
    expect(parseMemberTaskPage(page({ tasks: Array.from({ length: 21 }, () => task()) }), expected)).toBeNull();
  });

  it("rejects duplicate task identities and malformed actions", () => {
    expect(parseMemberTaskPage(page({ tasks: [task(), task()] }), expected)).toBeNull();
    expect(parseMemberTaskPage(page({ tasks: [task({ action_path: "https://example.test" })] }), expected)).toBeNull();
  });

  it("accepts an empty result without inventing a next page", () => {
    expect(parseMemberTaskPage(page({ total_count: 0, tasks: [] }), expected)?.tasks).toEqual([]);
    expect(parseMemberTaskPage(page({ total_count: 0, tasks: [], next_offset: 20 }), expected)).toBeNull();
  });
});

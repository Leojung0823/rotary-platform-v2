import { describe, expect, it } from "vitest";
import { latestDefinition } from "@/lib/attendance/latest-definition";
import { pendingTaskKinds, parseMemberHomeProjection } from "@/lib/member-home";
import { pendingTaskUrgency } from "./pending-task-urgency";
import { tasksFrom } from "@/lib/member-portal/from-projection";

const projection = latestDefinition("get_my_member_home_projection");

/** The kinds that genuinely have a due date. */
const withDeadline = ["event_response", "birthday_wish"];
/** The kinds that cannot be late, and so must never say they are. */
const withoutDeadline = ["dues_outstanding", "unread_messages", "profile_incomplete"];

function task(overrides: Record<string, unknown>) {
  return {
    kind: "event_response",
    title: "十月例會",
    detail: "",
    action_path: "/events",
    deadline: "2026-10-01T10:00:00.000Z",
    hours_remaining: 100,
    count: null,
    ...overrides,
  };
}

function parsedTasks(rows: readonly Record<string, unknown>[]) {
  const parsed = parseMemberHomeProjection({
    club: { club_code: "P-X", club_name: "測試社" },
    primary_event: null,
    next_event: null,
    recent_events: [],
    upcoming_events: [],
    pending_tasks: rows,
    notifications: { unread_count: 0, items: [] },
  });
  return parsed?.pendingTasks ?? null;
}

describe("待辦提醒不只有活動報名", () => {
  it("emits every kind the page knows how to draw", () => {
    for (const kind of pendingTaskKinds) {
      expect(projection, `the projection never emits ${kind}`).toContain(`'kind', '${kind}'`);
    }
  });

  it("parses each of them", () => {
    for (const kind of pendingTaskKinds) {
      const deadlineless = withoutDeadline.includes(kind);
      const rows = [task({
        kind,
        deadline: deadlineless ? null : "2026-10-01T10:00:00.000Z",
        hours_remaining: deadlineless ? null : 100,
        count: kind === "unread_messages" ? 3 : null,
      })];
      expect(parsedTasks(rows)?.[0].kind, `${kind} did not parse`).toBe(kind);
    }
  });
});

describe("一個不可能遲到的提醒不准說自己快遲到了", () => {
  // Unpaid dues carry no per-receivable due date in this schema, and nothing
  // goes wrong if a profile is never completed. Giving those a countdown would
  // be inventing a date nobody set.
  it.each(withoutDeadline)("%s carries no deadline in the projection", (kind) => {
    const branch = projection.slice(projection.indexOf(`'kind', '${kind}'`));
    const upToCount = branch.slice(0, branch.indexOf("'count',"));
    expect(upToCount).toContain("'deadline', null");
    expect(upToCount).toContain("'hours_remaining', null");
  });

  it.each(withDeadline)("%s does carry one", (kind) => {
    const branch = projection.slice(projection.indexOf(`'kind', '${kind}'`));
    const upToCount = branch.slice(0, branch.indexOf("'count',"));
    expect(upToCount).not.toContain("'hours_remaining', null");
  });

  it("gives a deadline-free task no urgency at all", () => {
    const parsed = parsedTasks([task({ kind: "dues_outstanding", deadline: null, hours_remaining: null })]);
    expect(pendingTaskUrgency(parsed![0])).toBeNull();
  });

  it("renders it without a status pill rather than an empty one", () => {
    const parsed = parsedTasks([task({ kind: "dues_outstanding", deadline: null, hours_remaining: null })]);
    expect(tasksFrom(parsed!)[0].status).toBeNull();
  });
});

describe("報名截止可以留空的活動，待辦仍然完整", () => {
  // Two of my own features collided: registration_deadline became nullable, so
  // an event_response row could carry a null deadline and a real countdown at
  // the same time. The parser rejects a row like that -- and rejecting one row
  // rejects the whole projection, which turned the member home into an error
  // state with every link on it gone. CI found it; nothing local did.
  it("reports when registration actually closes, not the nullable column", () => {
    const branch = projection.slice(projection.indexOf("'kind', 'event_response'"));
    const upToCount = branch.slice(0, branch.indexOf("'count',"));
    expect(upToCount).toContain("'deadline', public.event_registration_closes_at(");
    expect(upToCount, "the nullable column is used as the deadline")
      .not.toMatch(/'deadline',\s*task\.registration_deadline/u);
  });

  it("measures the countdown to that same moment", () => {
    const branch = projection.slice(projection.indexOf("'kind', 'event_response'"));
    const upToCount = branch.slice(0, branch.indexOf("'count',"));
    expect(upToCount).toContain("public.event_registration_closes_at(\n              task.registration_deadline, task.ends_at\n            )");
    expect(upToCount).toContain("'hours_remaining', floor(extract(epoch from (");
  });

  it("rejecting one row rejects the whole projection", () => {
    // Why the above matters this much: there is no partial answer. A single
    // malformed task takes the page with it.
    expect(parsedTasks([task({ deadline: null })])).toBeNull();
  });
});

describe("a row that half-carries a deadline is not a row", () => {
  // The two travel together. One without the other means the projection and
  // the parser disagree about what a row is, and guessing which is right would
  // put a countdown on something that has none.
  it("rejects a deadline with no countdown", () => {
    expect(parsedTasks([task({ hours_remaining: null })])).toBeNull();
  });

  it("rejects a countdown with no deadline", () => {
    expect(parsedTasks([task({ deadline: null })])).toBeNull();
  });

  it("rejects a countdown that has already run out", () => {
    expect(parsedTasks([task({ hours_remaining: -1 })])).toBeNull();
  });
});

describe("每一列自己說要去哪裡", () => {
  it("keeps the destination inside this app", () => {
    // The row decides where a tap goes. An absolute URL would let the
    // projection send a member off the platform.
    expect(parsedTasks([task({ action_path: "https://example.com" })])).toBeNull();
    expect(parsedTasks([task({ action_path: "//example.com" })])).toBeNull();
    expect(parsedTasks([task({ action_path: "/events" })])).not.toBeNull();
  });

  it("uses that destination rather than a hardcoded one", () => {
    // It was hardcoded to /events because there was only ever one kind.
    // A real destination: this test used to invent /me/finance, which is not a
    // route -- and the projection shipped pointing at it. A made-up path here
    // proves the row is carried, and quietly suggests the path is fine.
    const parsed = parsedTasks([task({ kind: "dues_outstanding", action_path: "/dues", deadline: null, hours_remaining: null })]);
    expect(tasksFrom(parsed!)[0].href).toBe("/dues");
  });

  it("uses each row's own title rather than 回覆活動報名", () => {
    const parsed = parsedTasks([task({ kind: "birthday_wish", title: "生日祝福待填寫", detail: "王社友" })]);
    expect(tasksFrom(parsed!)[0].title).toBe("生日祝福待填寫");
    expect(tasksFrom(parsed!)[0].detail).toBe("王社友");
  });

  it("counts rather than repeats the title for the kinds that count", () => {
    const parsed = parsedTasks([task({ kind: "unread_messages", count: 3, deadline: null, hours_remaining: null })]);
    expect(tasksFrom(parsed!)[0].detail).toBe("3 則");
  });

  it("refuses a count of zero", () => {
    // A row that counts nothing should not have been emitted at all.
    expect(parsedTasks([task({ kind: "unread_messages", count: 0, deadline: null, hours_remaining: null })])).toBeNull();
  });
});

describe("the two that can only ever be 'when you get a moment' sort last", () => {
  it("ranks them below the rest in the projection", () => {
    const rank = (kind: string) => {
      const at = projection.indexOf(`'kind', '${kind}'`);
      const before = projection.slice(0, at);
      return Number(/\n\s*(\d+),?[^\n]*\n(?:[^\n]*\n)?[^\n]*$/u.exec(before)?.[1] ?? "0");
    };
    expect(projection).toContain("order by sort_rank");
    for (const quiet of ["unread_messages", "profile_incomplete"]) {
      expect(rank(quiet), `${quiet} does not sort after the rest`).toBeGreaterThan(rank("event_response"));
    }
  });
});

// The pending_tasks list, from the aggregate down to its closing alias. Every
// rule below is about what this block may contain, because everything in it
// has to survive parsePendingTask -- and one row that does not takes the whole
// page with it.
const pendingTasksBlock = (() => {
  const from = projection.indexOf("'pending_tasks'");
  const to = projection.indexOf("'notifications'", from);
  expect(from, "pending_tasks is not in the projection").toBeGreaterThan(-1);
  expect(to, "notifications no longer follows pending_tasks").toBeGreaterThan(from);
  return projection.slice(from, to);
})();

describe("一個 null 就足以讓整頁消失", () => {
  // 社費未繳 read its currency from project_dues_receivable, which has never
  // carried one, so ->> answered null -- and null anywhere in a || makes the
  // whole concatenation null. detail arrived as null, the parser rejected the
  // row, and rejecting one row rejects the projection: every member who still
  // owed the club anything got 目前無法載入社員首頁資料 instead of a home page.
  // Four browser tests went red three layers away from the cause.

  it("builds no string with ||, which turns one null into a null row", () => {
    // Every value in a task row has to be non-null or the parser rejects the
    // row -- and rejecting one row rejects the projection. || is the one
    // operator here that manufactures a null out of code that reads as though
    // it cannot: 'TWD' came from a ->> whose key did not exist, so it was null,
    // so `null || ' ' || '3000'` was null, so detail was null, so every member
    // who owed the club anything got 目前無法載入社員首頁資料. concat_ws drops a
    // missing piece instead of erasing the whole string, so use that.
    const concatenations = pendingTasksBlock.split("\n")
      .map((line) => line.trim())
      .filter((line) => !line.startsWith("--") && line.includes("||"));
    expect(concatenations, "|| inside pending_tasks; use concat_ws").toEqual([]);
  });

  it("takes the currency from the column that declares it not null", () => {
    expect(pendingTasksBlock).toContain("dues.currency_code");
    const from = projection.indexOf("dues_outstanding as (");
    const cte = projection.slice(from, projection.indexOf("), birthday_wishes_to_write", from));
    expect(cte, "the CTE was not found where this guard expects it").toContain("limit 20");
    expect(cte, "the currency is read back out of a jsonb projection that never carried one")
      .not.toContain("'currency_code'");
  });

  it("rejects the row a null detail would have produced", () => {
    // The consequence, pinned: this is what the browser was actually seeing.
    expect(parsedTasks([task({ kind: "dues_outstanding", detail: null, deadline: null, hours_remaining: null })]))
      .toBeNull();
  });
});

describe("清單有長度上限，而上限是 parser 說了算", () => {
  // Each branch limits how much its own kind may contribute -- five events,
  // twenty receivables, five wishes. None of them limits the list, and the
  // parser refuses a list longer than it agreed to carry. A member with six
  // reminders had no home page.
  const longestAccepted = (() => {
    const row = () => task({ kind: "dues_outstanding", deadline: null, hours_remaining: null });
    for (let length = 1; length <= 64; length += 1) {
      if (parsedTasks(Array.from({ length }, row)) === null) return length - 1;
    }
    throw new Error("the parser accepts any length; this guard has nothing to check");
  })();

  it("refuses more rows than it agreed to carry", () => {
    expect(longestAccepted).toBeGreaterThan(0);
    expect(parsedTasks(Array.from(
      { length: longestAccepted + 1 },
      () => task({ kind: "dues_outstanding", deadline: null, hours_remaining: null }),
    ))).toBeNull();
  });

  it("limits the aggregate to exactly that many", () => {
    const limited = new RegExp(`order by sort_rank[^;]*?\\blimit ${longestAccepted}\\b`, "u");
    expect(limited.test(pendingTasksBlock),
      `the projection may emit more than ${longestAccepted} tasks, which the parser rejects outright`)
      .toBe(true);
  });
});

describe("生日已經過了，提醒還在，倒數不在", () => {
  // A campaign left collecting past the birthday still owes a wish -- that is
  // why it is still open -- but the countdown to that day is negative, and a
  // negative countdown is rejected along with the row and the page.
  const branch = (() => {
    const at = pendingTasksBlock.indexOf("'kind', 'birthday_wish'");
    return pendingTasksBlock.slice(at, pendingTasksBlock.indexOf("'count',", at));
  })();

  it("only carries the day while it is still ahead", () => {
    expect(branch).toMatch(/'deadline',\s*case\s*\n\s*when wish\.birthday_date::timestamptz > now\(\)/u);
  });

  it("and only counts down while it is still ahead", () => {
    expect(branch).toMatch(/'hours_remaining',\s*case\s*\n\s*when wish\.birthday_date::timestamptz > now\(\)/u);
  });

  it("still reminds after the day, with no deadline at all", () => {
    const wishes = projection.slice(projection.indexOf("birthday_wishes_to_write as ("));
    expect(wishes.slice(0, wishes.indexOf("), profile_gaps")),
      "the reminder stops at the birthday; nobody is told they still owe the wish")
      .not.toMatch(/birthday_date\s*>=?\s*(now\(\)|current_date)/u);
  });
});

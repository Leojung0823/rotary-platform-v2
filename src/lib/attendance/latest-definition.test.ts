import { describe, expect, it } from "vitest";
import { latestDefinition, migrationDefining } from "./latest-definition";

describe("the latest definition is the one the database runs", () => {
  // A few functions are re-declared with a plain `create function` after a
  // `drop function`, because their signature changed. Matching only
  // `create or replace` read the older definition of those and called it
  // current -- which is how a restatement of get_club_affairs_page came within
  // one merge of reverting the version that superseded it.
  it("finds a function re-declared with a plain create function", () => {
    expect(migrationDefining("set_club_event_audience"))
      .toBe("20260822000300_event_member_audiences.sql");
    expect(latestDefinition("set_club_event_audience")).toContain("p_membership_ids");
  });

  it("does not stop at an older create or replace", () => {
    // get_club_affairs_page is defined in 20260914000800 and re-declared in
    // 20260914001100; the later one wins.
    const current = migrationDefining("get_club_affairs_page");
    expect(current).not.toBe("20260914000800_club_service_plan.sql");
    expect(current! > "20260914000800_club_service_plan.sql").toBe(true);
  });

  it("returns a body that ends where the function does", () => {
    const body = latestDefinition("event_includes_current_member");
    expect(body).toContain("club_event_audience_members");
    expect(body).not.toContain("revoke all on function");
  });
});

import { describe, expect, it } from "vitest";
import { parseClubSearchResults } from "./results";

const valid = {
  query: "理事",
  events: [{
    id: "8c000000-0000-4000-8000-000000000001",
    title: "9月份理事會",
    location: "大拙匠人食品有限公司",
    starts_at: "2026-09-17T10:30:00.000Z",
  }],
  members: [{
    membership_id: "6c000000-0000-4000-8000-000000000002",
    display_name: "王理事",
    occupation: "建築師",
  }],
  messages: [{
    id: "9c000000-0000-4000-8000-000000000003",
    title: "理事會紀錄",
    published_at: "2026-09-10T02:00:00.000Z",
    is_unread: true,
  }],
};

describe("a search payload is validated, not trusted", () => {
  it("accepts the shape the RPC emits", () => {
    const parsed = parseClubSearchResults(valid);
    expect(parsed?.events[0].title).toBe("9月份理事會");
    expect(parsed?.members[0].displayName).toBe("王理事");
    expect(parsed?.messages[0].unread).toBe(true);
  });

  it("accepts an empty answer", () => {
    expect(parseClubSearchResults({ query: "xx", events: [], members: [], messages: [] }))
      .toEqual({ query: "xx", events: [], members: [], messages: [] });
  });

  it("treats a null text column as empty rather than rejecting the row", () => {
    // location and occupation are nullable in the database.
    const parsed = parseClubSearchResults({
      ...valid,
      events: [{ ...valid.events[0], location: null }],
      members: [{ ...valid.members[0], occupation: null }],
    });
    expect(parsed?.events[0].location).toBe("");
    expect(parsed?.members[0].occupation).toBe("");
  });
});

describe("a payload that does not parse is not an empty result", () => {
  // The page says either "nothing matched" or "something went wrong". A member
  // who searched for a colleague and was told "not found" would have no way to
  // know the search never ran.
  it.each([
    ["not an object", []],
    ["null", null],
    ["no query", { events: [], members: [], messages: [] }],
    ["events missing", { query: "x", members: [], messages: [] }],
    ["members missing", { query: "x", events: [], messages: [] }],
    ["messages missing", { query: "x", events: [], members: [] }],
  ])("rejects %s", (_name, value) => {
    expect(parseClubSearchResults(value)).toBeNull();
  });

  it.each([
    ["an id that is not a uuid", { ...valid.events[0], id: "1" }],
    ["an empty title", { ...valid.events[0], title: "" }],
    ["a title that is not a string", { ...valid.events[0], title: 7 }],
    ["an unparseable date", { ...valid.events[0], starts_at: "yesterday" }],
    ["a date that is not a string", { ...valid.events[0], starts_at: 1 }],
  ])("rejects an event with %s", (_name, row) => {
    expect(parseClubSearchResults({ ...valid, events: [row] })).toBeNull();
  });

  it("rejects a message whose read state is not a boolean", () => {
    // "is_unread": "false" is truthy. Coercing it would mark read messages
    // unread for every member.
    expect(parseClubSearchResults({
      ...valid,
      messages: [{ ...valid.messages[0], is_unread: "false" }],
    })).toBeNull();
  });

  it("rejects more rows than the RPC can return", () => {
    const many = Array.from({ length: 21 }, (_unused, index) => ({
      ...valid.members[0],
      membership_id: `6c000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    }));
    expect(parseClubSearchResults({ ...valid, members: many })).toBeNull();
  });

  it("rejects text longer than any column it renders", () => {
    expect(parseClubSearchResults({
      ...valid,
      events: [{ ...valid.events[0], title: "字".repeat(401) }],
    })).toBeNull();
  });
});

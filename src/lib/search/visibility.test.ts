import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { latestDefinition } from "@/lib/attendance/latest-definition";

const search = latestDefinition("search_my_club");
const migration = readFileSync("supabase/migrations/20260916000100_member_search.sql", "utf8");

/** The body of one branch of the search's result object. */
function branch(name: "events" | "members" | "messages"): string {
  const start = search.indexOf(`'${name}', coalesce((`);
  expect(start, `the ${name} branch is gone`).toBeGreaterThan(-1);
  return search.slice(start, search.indexOf("), '[]'::jsonb)", start));
}

describe("search never widens what a member may see", () => {
  // A search that finds more than the page it searches is a privacy leak
  // wearing a magnifying glass.
  it("honours the event audience rule", () => {
    // The same predicate list_club_events uses. An event addressed to
    // particular tags must not be findable by anyone outside them.
    expect(branch("events")).toContain("public.event_includes_current_member(event.id)");
  });

  it("finds published events only", () => {
    expect(branch("events")).toContain("event.event_status = 'published'");
  });

  it("stays inside the club that was asked about", () => {
    expect(branch("events")).toContain("event.club_id = p_club_id");
    expect(branch("members")).toContain("membership.club_id = p_club_id");
    expect(branch("messages")).toContain("recipient.club_id = p_club_id");
  });

  it("finds only messages delivered to this membership", () => {
    // Not "sent to this club" -- the recipient row is the delivery.
    expect(branch("messages")).toContain("recipient.membership_id = my_membership_id");
    expect(branch("messages")).toContain("message.status = 'active'");
  });

  it("does not search contact details the directory may be hiding", () => {
    // Email and phone appear in the directory only when that member allowed
    // it, so matching on them would confirm a value the searcher cannot read.
    const members = branch("members");
    expect(members).not.toContain("primary_email");
    expect(members).not.toContain("primary_phone");
    expect(members).not.toContain("birth_date");
  });

  it("does not return contact details either", () => {
    expect(branch("members")).not.toContain("'email'");
    expect(branch("members")).not.toContain("'phone'");
  });
});

describe("the search is guarded like the pages it searches", () => {
  it("requires the same access the events page requires", () => {
    const preamble = search.slice(0, search.indexOf("select jsonb_build_object"));
    expect(preamble).toContain("public.current_can_access_club_events(p_club_id)");
    expect(preamble).toContain("'42501'");
  });

  it("is not executable by anonymous callers", () => {
    expect(migration).toContain(
      "revoke all on function public.search_my_club(uuid, text, integer) from public, anon",
    );
    expect(migration).toContain(
      "grant execute on function public.search_my_club(uuid, text, integer) to authenticated",
    );
  });

  it("is read-only", () => {
    expect(search).toContain("stable");
    for (const write of ["insert into", "update ", "delete from"]) {
      expect(search.toLowerCase(), `search performs a ${write}`).not.toContain(write);
    }
  });

  it("bounds how much one question can return", () => {
    const preamble = search.slice(0, search.indexOf("select jsonb_build_object"));
    expect(preamble).toContain("p_limit > 20");
    for (const name of ["events", "members", "messages"] as const) {
      expect(branch(name), `${name} is unbounded`).toContain("limit p_limit");
    }
  });
});

describe("the needle is data, not pattern syntax", () => {
  it("escapes the wildcards before building the pattern", () => {
    // A member searching for "100%" is searching for a percentage, and one
    // searching for "a_b" for that name. The backslash is replaced first, so
    // the escapes the other two introduce are not escaped a second time.
    const line = search.split("\n").find((candidate) => candidate.includes("pattern :="));
    expect(line, "the pattern is no longer built from the needle").toBeDefined();
    expect(line).toContain(String.raw`replace(replace(replace(needle, '\', '\\'), '%', '\%'), '_', '\_')`);
  });

  it("answers nothing to a question that asks for everything", () => {
    expect(search).toContain("char_length(needle) < 2");
  });
});

describe("the box submits somewhere", () => {
  const header = readFileSync("src/components/member-portal/member-portal.tsx", "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/gu, "");

  /** The header's search form, from its opening tag to its close. */
  function box(): string {
    const open = header.indexOf("<form");
    expect(open, "the header no longer contains a form").toBeGreaterThan(-1);
    const slice = header.slice(open, header.indexOf("</form>", open));
    expect(slice, "the first form in the header is not the search box").toContain("styles.search");
    return slice;
  }

  it("is a form, not decoration", () => {
    // It looked like a search and answered nothing, which is worse than no box.
    expect(box()).toContain('action="/search"');
    expect(box()).toContain('method="get"');
    expect(box()).toContain('role="search"');
    expect(box()).toContain('name="q"');
  });

  it("can be submitted without a keyboard Enter", () => {
    // A form with a single text input submits on Enter, but a pointer user
    // needs a control -- visually hidden is still reachable.
    expect(box()).toMatch(/<button[^>]*type="submit"/u);
  });

  it("stops promising what it does not search", () => {
    expect(header).not.toContain("搜尋活動、社員或公告");
    expect(header).toContain("搜尋活動、社員或訊息");
  });
});

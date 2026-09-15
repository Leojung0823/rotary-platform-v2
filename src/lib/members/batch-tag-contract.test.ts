import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260915000600_batch_member_tag_assignment.sql",
  "utf8",
);
const actions = readFileSync("src/app/tag-actions.ts", "utf8");
const form = readFileSync("src/components/members/member-tag-batch-form.tsx", "utf8");
const roster = readFileSync("src/app/(authenticated)/clubs/[clubId]/members/page.tsx", "utf8");

/** The parameters the function actually declares, in declaration order. */
function declaredParameters(): string[] {
  const start = migration.indexOf("create or replace function public.apply_member_tag_to_memberships(");
  expect(start, "the batch tagging function is gone").toBeGreaterThan(-1);
  const block = migration.slice(start, migration.indexOf(")\nreturns jsonb", start));
  return [...block.matchAll(/^\s{2}(p_[a-z_]+)\s/gmu)].map((match) => match[1]);
}

/** The parameters the server action sends. */
function sentParameters(): string[] {
  const start = actions.indexOf('supabase.rpc("apply_member_tag_to_memberships", {');
  expect(start, "the server action no longer calls the batch RPC").toBeGreaterThan(-1);
  const block = actions.slice(start, actions.indexOf("});", start));
  return [...block.matchAll(/^\s{4}(p_[a-z_]+):/gmu)].map((match) => match[1]);
}

/** The form fields the action reads out of the submission. */
function fieldsRead(): Set<string> {
  const start = actions.indexOf("export async function applyMemberTagToSelectionAction");
  const block = actions.slice(start);
  return new Set([
    ...[...block.matchAll(/formData\.get\("([A-Za-z]+)"\)/gu)].map((match) => match[1]),
    ...[...block.matchAll(/parseUuidList\(formData, "([A-Za-z]+)"\)/gu)].map((match) => match[1]),
  ]);
}

/** The `name` of every JSX element in `source` that `pattern` matches. */
function nameAttributes(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)]
    .map((match) => /\sname="([A-Za-z]+)"/u.exec(match[0])?.[1])
    .filter((name): name is string => name !== undefined);
}

/**
 * The field names the submitted form actually carries.
 *
 * Read off rendered elements rather than off any string containing `name="`:
 * the first version of this matched the selector inside the component's own
 * querySelectorAll, so renaming the checkbox on the roster left it green.
 */
function fieldsPosted(): Set<string> {
  return new Set([
    // The picker, the mode buttons and the hidden club id.
    ...nameAttributes(form, /<(?:input|Select|Button)\s[^>]*?>/gu),
    // The checkbox for each member lives on the roster page, inside this form.
    ...nameAttributes(roster, /<input\s[^>]*?type="checkbox"[^>]*?\/>/gu),
  ]);
}

/** The field the client component watches to count and toggle the selection. */
function fieldWatchedByScript(): string {
  const found = /querySelectorAll<HTMLInputElement>\(\s*'input\[name="([A-Za-z]+)"\]'/u.exec(form);
  expect(found, "the component no longer looks the checkboxes up by name").not.toBeNull();
  return found![1];
}

describe("batch member tagging: the RPC, the action and the form agree", () => {
  // Two sides that must match by name and cannot be checked by the compiler:
  // Supabase rpc() arguments are a plain object, and form fields are strings.
  it("sends exactly the parameters the function declares", () => {
    expect(sentParameters()).toEqual(declaredParameters());
  });

  it("reads only fields the form posts", () => {
    const posted = fieldsPosted();
    for (const field of fieldsRead()) expect(posted, `form never posts "${field}"`).toContain(field);
  });

  it("counts and toggles the checkboxes the roster actually renders", () => {
    // "全選" and the selected count go through querySelectorAll, which fails
    // silently against a name nothing renders.
    expect(fieldsPosted()).toContain(fieldWatchedByScript());
  });

  it("posts a tag and a selection, not a single membership", () => {
    // set_membership_tags takes one membership and replaces its whole tag set.
    // Reaching for it here would strip every other tag from everyone selected.
    const start = actions.indexOf("export async function applyMemberTagToSelectionAction");
    expect(actions.slice(start)).not.toContain("set_membership_tags");
    expect(fieldsPosted()).toContain("membershipIds");
  });
});

describe("the removal branch cannot strip tags it was not asked to", () => {
  /** The where clause of the delete inside the function. */
  function deleteScope(): string {
    const start = migration.indexOf("delete from public.club_membership_tags");
    expect(start, "the removal branch is gone").toBeGreaterThan(-1);
    return migration.slice(start, migration.indexOf("returning 1", start));
  }

  // An unscoped delete here is the one mistake in this feature that cannot be
  // undone from the UI: it would clear other tags, or other clubs' rows,
  // for everyone in the selection.
  it("deletes only the chosen tag", () => {
    expect(deleteScope()).toMatch(/tag_id\s*=\s*p_tag_id/u);
  });

  it("deletes only within the acting club", () => {
    expect(deleteScope()).toMatch(/club_id\s*=\s*p_club_id/u);
  });

  it("deletes only the selected memberships", () => {
    expect(deleteScope()).toMatch(/membership_id\s*=\s*any\s*\(\s*wanted\s*\)/u);
  });
});

describe("the batch function is guarded like the rest of the tag RPCs", () => {
  function body(): string {
    const start = migration.indexOf("create or replace function public.apply_member_tag_to_memberships(");
    return migration.slice(start, migration.indexOf("revoke all on function", start));
  }

  it("requires member.manage before it writes", () => {
    const guard = body().indexOf("current_has_club_permission(p_club_id, 'member.manage')");
    const firstWrite = Math.min(
      ...["insert into public.club_membership_tags", "delete from public.club_membership_tags"]
        .map((statement) => body().indexOf(statement))
        .filter((index) => index > -1),
    );
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(firstWrite);
  });

  it("rejects a tag from another club or an archived one", () => {
    expect(body()).toMatch(/tag\.club_id = p_club_id\s+and tag\.tag_status = 'active'/u);
  });

  it("rejects a membership from another club", () => {
    expect(body()).toMatch(/membership\.club_id = p_club_id/u);
  });

  it("is not executable by anonymous callers", () => {
    expect(migration).toContain(
      "revoke all on function public.apply_member_tag_to_memberships(uuid, uuid, uuid[], text) from public, anon",
    );
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/(authenticated)/me/page.tsx", "utf8");
const backfill = readFileSync("supabase/migrations/20260917000700_privacy_defaults_all_public.sql", "utf8");

describe("隱私設定只有一個地方", () => {
  // 生日公開設定 was its own card, its own heading and its own save button, on
  // the same page as 通知與名冊隱私 -- and it asks the same question: what can
  // people in my club see about me. Two places meant changing one and believing
  // both had changed.

  it("keeps the birthday settings inside the privacy section", () => {
    const at = page.indexOf("SHOW_PRIVACY_SETTINGS && <Card>");
    expect(at, "there is no single privacy section").toBeGreaterThan(-1);
    // The rendered heading, not the first mention: the comment introducing the
    // merge quotes the name, and indexOf lands inside it. Fourth time this
    // session that a guard has been fooled by prose sitting above the code.
    const birthday = page.indexOf("<h3>生日公開設定</h3>");
    expect(birthday, "the birthday settings are gone entirely").toBeGreaterThan(-1);
    expect(birthday, "the birthday settings sit outside the privacy section").toBeGreaterThan(at);
  });

  it("leaves one heading, not two cards", () => {
    expect(page, "the old standalone heading is still a card of its own")
      .not.toMatch(/<h2>生日公開設定<\/h2>/u);
    expect(page).toContain("<h3>生日公開設定</h3>");
  });
});

describe("先隱藏，但沒有拆掉", () => {
  // Hidden at the club's request while they decide what these should say.
  // Deleting them would make bringing them back a rebuild.
  it("hides each one behind its own named switch", () => {
    for (const name of ["SHOW_ACCOUNT_STATUS", "SHOW_LINE_NOTICE_CARD", "SHOW_PRIVACY_SETTINGS"]) {
      expect(page, `${name} is not declared`).toMatch(new RegExp(`const ${name} = false;`, "u"));
      expect(page, `${name} is declared but nothing reads it`)
        .toMatch(new RegExp(`\\{${name} &&`, "u"));
    }
  });

  it("keeps three switches rather than one", () => {
    // They are three decisions. One switch would mean the next person cannot
    // bring back the account status without also revealing the privacy form.
    const declared = page.match(/const SHOW_\w+ = false;/gu) ?? [];
    expect(declared.length).toBe(3);
  });

  it("still loads and still saves behind them", () => {
    // Hiding the form must not quietly stop the data being read, or turning it
    // back on will show empty boxes.
    // Word-bounded: `toContain` is satisfied by any longer name that happens to
    // start with this one, so renaming the action would slip straight past.
    expect(page, "the privacy form no longer submits anywhere")
      .toMatch(/\bupdateIdentitySettingsAction\b/u);
    expect(page, "the birthday form no longer submits anywhere")
      .toMatch(/\bsetBirthdayPreferenceAction\b/u);
  });
});

describe("回填只補沒設定過的人", () => {
  // The club president decided on 2026-09-17 that memberships which had never
  // set a preference should become public, knowing the settings are hidden and
  // so members cannot currently turn it off. That decision is recorded.
  //
  // What it is not: overturning a choice someone made. A row that says false
  // says it because a person went in and said so.

  it("inserts a row only where none exists", () => {
    expect(backfill).toMatch(/insert into public\.birthday_visibility_preferences/u);
    expect(backfill).toMatch(/not exists \(\s*select 1 from public\.birthday_visibility_preferences/u);
  });

  it("never updates an existing preference", () => {
    expect(backfill, "the backfill overwrites a member's own choice")
      .not.toMatch(/update public\.birthday_visibility_preferences/u);
  });

  it("leaves a membership with no birth date alone", () => {
    // The row means "my birthday may be seen", and they do not have one yet.
    expect(backfill).toMatch(/person\.birth_date is not null/u);
  });

  it("records who decided it and how many people it moved", () => {
    // A bulk privacy change the club has to be able to account for later.
    expect(backfill).toContain("privacy.birthday_defaults_backfilled");
    expect(backfill).toContain("memberships_made_public");
    expect(backfill).toContain("decided_by");
  });
});

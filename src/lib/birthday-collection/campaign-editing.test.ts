import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { latestDefinition } from "@/lib/attendance/latest-definition";
import { birthdayCollectionRpcErrorCode } from "./rpc-error";

const close = latestDefinition("close_birthday_wish_campaign");
const updateDate = latestDefinition("update_birthday_wish_campaign_date");
const migration = readFileSync(
  "supabase/migrations/20260916001000_edit_birthday_wish_campaigns.sql",
  "utf8",
);
const card = readFileSync("src/components/birthday-collection/birthday-collection-management.tsx", "utf8");
const actions = readFileSync("src/app/birthday-collection-actions.ts", "utf8");

describe("一個建好的徵集可以收掉", () => {
  // create_birthday_wish_campaign has existed since the module shipped and
  // nothing could undo it. A month run with the wrong date, or for someone who
  // has since left, stayed on the page for good -- and the members assigned to
  // it kept being reminded about it.
  it("ends a draft or a collecting campaign as closed", () => {
    expect(close).toContain("when 'draft' then 'closed'");
    expect(close).toContain("when 'collecting' then 'closed'");
  });

  it("takes a published one back as hidden instead", () => {
    // The recipient has already seen it. hidden is the status
    // list_published_birthday_wish_submissions already excludes.
    expect(close).toContain("when 'published' then 'hidden'");
    const published = latestDefinition("list_published_birthday_wish_submissions");
    expect(published).toContain("campaign_status <> 'hidden'");
  });

  it("refuses to end something already ended", () => {
    expect(close).toContain("campaign_already_ended");
  });

  it("requires a reason and records it", () => {
    expect(close).toContain("campaign_close_reason_required");
    const audit = close.slice(close.indexOf("insert into public.audit_logs"));
    expect(audit).toContain("'birthday_campaign.closed'");
    expect(audit).toContain("'reason', normalized_reason");
    expect(audit).toContain("'from_status', target.campaign_status");
  });
});

describe("日期改得動，年份改不動", () => {
  it("only while it is still being written", () => {
    // Once the recipient has seen the result, the date it was collected for is
    // part of what they saw.
    expect(updateDate).toContain("campaign_status not in ('draft', 'collecting')");
  });

  it("keeps the date inside the campaign's own year", () => {
    // birthday_year is the campaign's identity -- one per member per year --
    // and the table constrains the date to fall inside it.
    expect(updateDate).toContain("extract(year from p_birthday_date)::integer <> target.birthday_year");
  });

  it("records what it changed from", () => {
    expect(updateDate).toContain("'from_date', target.birthday_date");
    expect(updateDate).toContain("'to_date', p_birthday_date");
  });
});

describe("both are an officer's to do, and only in their own club", () => {
  it.each([["close", close], ["update", updateDate]])("%s requires the manager permission", (_name, body) => {
    expect(body).toContain("public.current_can_manage_birthday_collection(p_club_id)");
    expect(body).toContain("'42501'");
  });

  it.each([["close", close], ["update", updateDate]])("%s scopes the lookup to the club", (_name, body) => {
    expect(body).toContain("where id = p_campaign_id and club_id = p_club_id for update");
  });

  it("is not executable by anonymous callers", () => {
    expect(migration).toContain("revoke all on function public.close_birthday_wish_campaign(uuid, uuid, text) from public, anon");
    expect(migration).toContain("revoke all on function public.update_birthday_wish_campaign_date(uuid, uuid, date) from public, anon");
  });
});

describe("「請寫下原因」不可以讀成「沒有權限」", () => {
  // The generic rule maps anything containing "required" to forbidden, and the
  // code is campaign_close_reason_required. Order matters, and nothing but a
  // test says so.
  it("maps the reason code to its own message", () => {
    expect(birthdayCollectionRpcErrorCode("campaign_close_reason_required")).toBe("reason_required");
  });

  it("still maps a real permission failure to forbidden", () => {
    expect(birthdayCollectionRpcErrorCode("birthday_collection_manager_required")).toBe("forbidden");
  });

  it("gives the other new codes their own meanings", () => {
    expect(birthdayCollectionRpcErrorCode("campaign_already_ended")).toBe("already_ended");
    expect(birthdayCollectionRpcErrorCode("campaign_not_available")).toBe("not_found");
    expect(birthdayCollectionRpcErrorCode("invalid_campaign_date")).toBe("invalid_input");
  });
});

describe("the card says which ending it is offering", () => {
  it("offers hiding for a published campaign and ending for the rest", () => {
    expect(card).toContain('campaign.campaignStatus === "published" ? "隱藏這批祝福" : "結束這個徵集"');
  });

  it("says what happens next, which differs between the two", () => {
    expect(card).toContain("壽星已經看過這批祝福，隱藏之後他就不會再看到。");
    expect(card).toContain("結束之後，指派給社員的待辦也會一併消失。");
  });

  it("does not offer a date change on a published campaign", () => {
    // From the disclosure to the close form -- sliced to the *usage*, not to
    // the import of the same name at the top of the file, which is where the
    // first version of this looked and found an empty string.
    const start = card.indexOf("styles.campaignEdit");
    const editBlock = card.slice(start, card.indexOf("action={closeBirthdayCampaignAction}", start));
    expect(editBlock, "the slice is empty, so this asserts nothing").not.toBe("");
    expect(editBlock).toContain('campaign.campaignStatus === "draft" || campaign.campaignStatus === "collecting"');
  });

  it("reports which of the two endings happened", () => {
    const action = actions.slice(actions.indexOf("export async function closeBirthdayCampaignAction"));
    expect(action).toContain('status === "hidden" ? "campaign_hidden" : "campaign_closed"');
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { latestDefinition } from "@/lib/attendance/latest-definition";
import { parseDuesFinanceMutationBody } from "./validation";

const panel = readFileSync("src/components/dues-finance/dues-finance-management.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20260917000200_membership_remit_keys.sql", "utf8");

function mutation(overrides: Record<string, unknown> = {}) {
  return {
    action: "set_remit_key",
    clubId: "4d000000-0000-4000-8000-000000000001",
    membershipId: "4e000000-0000-4000-8000-000000000001",
    keyKind: "bank_last5",
    keyValue: "12345",
    note: null,
    ...overrides,
  };
}

describe("只存後幾碼，不存帳號", () => {
  // Reconciliation needs enough to recognise someone, not enough to identify an
  // account. The full number would be a risk kept in the database for no gain,
  // so the same shape is refused at the edge and again by the column.

  it("takes five digits for a bank line and four for a card", () => {
    expect(parseDuesFinanceMutationBody(mutation())).toMatchObject({ keyValue: "12345" });
    expect(parseDuesFinanceMutationBody(mutation({ keyKind: "card_last4", keyValue: "4321" })))
      .toMatchObject({ keyKind: "card_last4", keyValue: "4321" });
  });

  it("refuses a full account number", () => {
    expect(() => parseDuesFinanceMutationBody(mutation({ keyValue: "822001234512345" }))).toThrow();
  });

  it("refuses the wrong length for the kind", () => {
    expect(() => parseDuesFinanceMutationBody(mutation({ keyValue: "1234" }))).toThrow();
    expect(() => parseDuesFinanceMutationBody(mutation({ keyKind: "card_last4", keyValue: "12345" }))).toThrow();
  });

  it("refuses anything that is not digits", () => {
    expect(() => parseDuesFinanceMutationBody(mutation({ keyValue: "1234a" }))).toThrow();
    expect(() => parseDuesFinanceMutationBody(mutation({ keyValue: "     " }))).toThrow();
  });

  it("says the same thing in the column, not only at the edge", () => {
    // A check at the edge alone is a check that one unvalidated caller removes.
    expect(migration).toMatch(/key_kind = 'bank_last5' and key_value ~ '\^\[0-9\]\{5\}\$'/u);
    expect(migration).toMatch(/key_kind = 'card_last4' and key_value ~ '\^\[0-9\]\{4\}\$'/u);
  });
});

describe("誰能改，以及一組數字只能指向一個人", () => {
  it("lets only finance managers write one", () => {
    const setter = latestDefinition("set_membership_remit_key");
    expect(setter).toContain("current_has_dues_finance_permission(p_club_id, 'finance.manage')");
    expect(latestDefinition("remove_membership_remit_key"))
      .toContain("current_has_dues_finance_permission(p_club_id, 'finance.manage')");
    // Reading is a lower bar than writing, but still not open to the club.
    expect(latestDefinition("list_club_remit_keys"))
      .toContain("current_has_dues_finance_permission(p_club_id, 'finance.read')");
  });

  it("keeps one set of digits pointing at one member", () => {
    // Two members behind the same digits leaves 「這筆是誰的」 with no answer.
    expect(migration).toMatch(/unique \(club_id, key_kind, key_value\)/u);
    expect(latestDefinition("set_membership_remit_key"), "a second member silently gets their own row")
      .toMatch(/update public\.club_membership_remit_keys[\s\S]{0,200}set membership_id = p_membership_id/u);
  });

  it("audits taking a key away from whoever had it", () => {
    expect(latestDefinition("set_membership_remit_key"))
      .toMatch(/'dues\.remit_key_reassigned'[\s\S]{0,200}'from_membership_id', existing\.membership_id/u);
  });

  it("stays deletable, because it is a lookup aid and not a finance record", () => {
    // Members change accounts and treasurers mistype. The finance tables carry
    // an immutability trigger; this one deliberately does not.
    expect(migration, "the remit key table was made immutable like a finance record")
      .not.toContain("prevent_club_finance_immutable_mutation");
    expect(migration).toContain("delete from public.club_membership_remit_keys");
  });
});

describe("記住這件事不准把收款拖下水", () => {
  // The money is already in the club's account. Failing to remember the digits
  // means recognising them by hand next month -- it is not a reason to report a
  // banked payment as failed.
  it("records the receipt first and remembers afterwards", () => {
    const receipt = panel.indexOf("const data = await postMutation(body);");
    const followUp = panel.indexOf("if (followUp)", receipt);
    expect(receipt, "the receipt mutation is missing").toBeGreaterThan(-1);
    expect(followUp, "the follow-up must be located after the receipt mutation").toBeGreaterThan(receipt);
  });

  it("keeps a failed follow-up from failing the receipt", () => {
    // Read the block itself, not the distance between two strings: the first
    // version of this matched `postMutation(followUp)` near `setMessageTone`,
    // which stayed true with the catch deleted.
    const at = panel.indexOf("if (followUp) {");
    expect(at, "the follow-up is no longer guarded at all").toBeGreaterThan(-1);
    let depth = 0;
    let end = at;
    for (let cursor = panel.indexOf("{", at); cursor < panel.length; cursor += 1) {
      if (panel[cursor] === "{") depth += 1;
      else if (panel[cursor] === "}") {
        depth -= 1;
        if (depth === 0) { end = cursor; break; }
      }
    }
    const block = panel.slice(at, end);
    expect(block, "the follow-up is not wrapped in a try").toContain("try {");
    expect(block, "a failed follow-up is not caught").toMatch(/\}\s*catch\s*\{/u);
    expect(block, "the caught failure is rethrown, failing the receipt with it")
      .not.toContain("throw");
    expect(block, "the receipt is not reported as the success it was")
      .toContain('setMessageTone("success")');
    expect(block).toContain("收款已登錄，但這組末五碼沒有記起來");
  });

  it("only offers it where there is something to recognise", () => {
    // Cash tells you nothing about who paid; there is nothing to learn from it.
    expect(panel).toMatch(/function leavesARemitKey\([\s\S]{0,140}method === "bank_transfer"/u);
  });

  it("asks before remembering", () => {
    expect(panel).toContain("記住這組數字，下次對帳自動認出");
    expect(panel).toMatch(/!rememberRemitKey \|\| remitKeyValue\.trim\(\) === ""/u);
  });
});

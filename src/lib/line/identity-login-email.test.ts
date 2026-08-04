import { describe, expect, it } from "vitest";
import { lineIdentityLoginEmail } from "./identity-login-email";

describe("LINE identity login email", () => {
  it("is stable for the same LINE identity and person", () => {
    expect(lineIdentityLoginEmail("Utest12345678", "person-a"))
      .toBe(lineIdentityLoginEmail("Utest12345678", "person-a"));
  });

  it("allows an unbound LINE identity to move to a different person without Auth email collision", () => {
    expect(lineIdentityLoginEmail("Utest12345678", "person-a"))
      .not.toBe(lineIdentityLoginEmail("Utest12345678", "person-b"));
  });
});

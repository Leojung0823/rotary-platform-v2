import { describe, expect, it } from "vitest";
import { parseClubPermissionRows } from "./club-permissions.server";

describe("club permission server boundary", () => {
  it("accepts unique permission keys from the RPC projection", () => {
    expect(parseClubPermissionRows([
      { permission_key: "member.manage" },
      { permission_key: "identity.read" },
    ])).toEqual({
      ok: true,
      permissions: ["member.manage", "identity.read"],
    });
  });

  it("fails closed for malformed or duplicated rows", () => {
    expect(parseClubPermissionRows([{ permission_key: "member.manage" }, { permission_key: "member.manage" }]))
      .toEqual({ ok: false, permissions: [] });
    expect(parseClubPermissionRows([{ permission_key: "member manage" }]))
      .toEqual({ ok: false, permissions: [] });
    expect(parseClubPermissionRows(null)).toEqual({ ok: false, permissions: [] });
  });
});

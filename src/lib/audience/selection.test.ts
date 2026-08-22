import { describe, expect, it } from "vitest";
import {
  addressesWholeClub,
  audienceQueryString,
  emptyAudienceSelection,
  resolvedAudience,
  toggleId,
} from "./selection";

const tagId = "71000000-0000-4000-8000-000000000001";
const otherTagId = "71000000-0000-4000-8000-000000000002";
const membershipId = "72000000-0000-4000-8000-000000000001";

describe("resolvedAudience", () => {
  it("sends nothing at all for the whole club", () => {
    expect(resolvedAudience(emptyAudienceSelection)).toEqual({ tagIds: [], membershipIds: [] });
  });

  it("drops the lists the current mode does not use", () => {
    // Switching back to 全社 must clear both, not merely hide them: the
    // database has no notion of mode, so anything still attached would keep
    // restricting an audience the officer thought they had removed.
    const selection = { mode: "everyone" as const, tagIds: [tagId], membershipIds: [membershipId] };
    expect(resolvedAudience(selection)).toEqual({ tagIds: [], membershipIds: [] });

    expect(resolvedAudience({ ...selection, mode: "tags" }))
      .toEqual({ tagIds: [tagId], membershipIds: [] });
    expect(resolvedAudience({ ...selection, mode: "members" }))
      .toEqual({ tagIds: [], membershipIds: [membershipId] });
  });
});

describe("addressesWholeClub", () => {
  it("is true when a mode is chosen but nothing is ticked", () => {
    expect(addressesWholeClub({ mode: "tags", tagIds: [], membershipIds: [] })).toBe(true);
    expect(addressesWholeClub({ mode: "members", tagIds: [tagId], membershipIds: [] })).toBe(true);
    expect(addressesWholeClub({ mode: "tags", tagIds: [tagId], membershipIds: [] })).toBe(false);
  });
});

describe("audienceQueryString", () => {
  it("repeats a parameter per id rather than joining them", () => {
    const query = audienceQueryString({ mode: "tags", tagIds: [tagId, otherTagId], membershipIds: [] });
    expect(query).toBe(`tagId=${tagId}&tagId=${otherTagId}`);
  });

  it("is empty for the whole club, which is what the resolver treats as everyone", () => {
    expect(audienceQueryString(emptyAudienceSelection)).toBe("");
  });
});

describe("toggleId", () => {
  it("adds and removes without duplicating", () => {
    expect(toggleId([], tagId)).toEqual([tagId]);
    expect(toggleId([tagId], tagId)).toEqual([]);
    expect(toggleId([tagId], otherTagId)).toEqual([tagId, otherTagId]);
  });
});

import { describe, expect, it } from "vitest";
import {
  parseBlessingIouClubs,
  parseBlessingIouEntry,
  parseBlessingIouListProjection,
  parseBlessingIouManagementContext,
} from "./contracts";

const entry = {
  id: "11000000-0000-4000-8000-000000000001",
  blessing_text: "祝福大家平安",
  pledged_amount: 1000,
  has_pledge: true,
  currency_code: "TWD",
  amount_is_public: true,
  pledged_on: "2026-08-19",
  created_at: "2026-08-19T10:00:00.000Z",
  updated_at: "2026-08-19T10:00:00.000Z",
  author_display_name: "測試社員",
  author_avatar_url: null,
  can_edit: true,
  can_delete: true,
  viewer_can_manage: false,
};

describe("blessing IOU projection contracts", () => {
  it("parses bounded club, entry, list, and management projections", () => {
    expect(parseBlessingIouClubs([{
      club_id: "21000000-0000-4000-8000-000000000001",
      club_code: "TEST",
      club_name: "測試扶輪社",
      allow_public_amounts: false,
      can_manage: true,
    }])).toHaveLength(1);
    expect(parseBlessingIouEntry(entry)).toMatchObject({
      blessingText: "祝福大家平安",
      pledgedAmount: 1000,
      amountIsPublic: true,
    });
    expect(parseBlessingIouListProjection({
      entries: [entry], next_cursor: null, viewer_can_manage: false,
    }).entries).toHaveLength(1);
    expect(parseBlessingIouManagementContext({
      club_id: "21000000-0000-4000-8000-000000000001",
      club_code: "TEST",
      club_name: "測試扶輪社",
      allow_public_amounts: true,
    }).allowPublicAmounts).toBe(true);
  });

  it("accepts a hidden pledge without pretending it is a pure blessing", () => {
    expect(parseBlessingIouEntry({
      ...entry,
      pledged_amount: null,
      has_pledge: true,
      amount_is_public: false,
      can_edit: false,
    })).toMatchObject({ pledgedAmount: null, hasPledge: true });
  });

  it("rejects inconsistent, oversized, or authority-leaking shapes", () => {
    expect(() => parseBlessingIouEntry({
      ...entry, has_pledge: false, pledged_amount: 1000,
    })).toThrow("invalid_blessing_iou_entry_projection");
    expect(() => parseBlessingIouEntry({
      ...entry, amount_is_public: true, pledged_amount: null,
    })).toThrow("invalid_blessing_iou_entry_projection");
    expect(() => parseBlessingIouListProjection({
      entries: [{ ...entry, viewer_can_manage: true }],
      next_cursor: null,
      viewer_can_manage: false,
    })).toThrow("invalid_blessing_iou_list_projection");
    expect(() => parseBlessingIouClubs(Array.from({ length: 101 }, (_, index) => ({
      club_id: `21000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      club_code: "TEST",
      club_name: "測試扶輪社",
      allow_public_amounts: false,
      can_manage: false,
    })))).toThrow("invalid_blessing_iou_club_projection");
  });
});

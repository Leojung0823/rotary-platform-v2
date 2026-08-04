import { describe, expect, it } from "vitest";
import { dashboardAccessPresentation } from "./dashboard-access";

describe("dashboard access presentation", () => {
  it("shows a general member as a general member instead of an executive secretary", () => {
    expect(dashboardAccessPresentation(false, [{ permission_level: "club_member" }])).toEqual({
      canManageClubs: false,
      clubCountLabel: "已加入扶輪社",
      roleLabel: "一般社員",
    });
  });

  it("shows a club manager as an executive secretary", () => {
    expect(dashboardAccessPresentation(false, [{ permission_level: "club_manager" }])).toEqual({
      canManageClubs: true,
      clubCountLabel: "可管理扶輪社",
      roleLabel: "執行秘書",
    });
  });

  it("prioritizes a platform administrator role", () => {
    expect(dashboardAccessPresentation(true, [{ permission_level: "club_member" }])).toEqual({
      canManageClubs: true,
      clubCountLabel: "可管理扶輪社",
      roleLabel: "平台管理員",
    });
  });
});

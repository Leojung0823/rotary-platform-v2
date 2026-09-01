import { describe, expect, it } from "vitest";
import { managementToolsForClub } from "./management-tools";

const clubId = "71000000-0000-4000-8000-000000000001";
const allPermissions = [
  "member.manage",
  "invitation.manage",
  "identity.read",
  "blessing_iou.manage",
  "role.manage",
];
const allFeatures = {
  blessingIouEnabled: true,
  birthdayCollectionEnabled: true,
  archiveHandoverEnabled: true,
};

describe("management overview cards", () => {
  it("shows each low-frequency tool only when its permission and flag allow it", () => {
    expect(managementToolsForClub(clubId, allPermissions, allFeatures).map((tool) => tool.id)).toEqual([
      "members",
      "invitations",
      "identity",
      "blessing-iou",
      "birthday-collection",
      "archives",
      "operators",
    ]);
  });

  it("fails closed for missing permissions and disabled feature flags", () => {
    expect(managementToolsForClub(clubId, ["member.manage", "blessing_iou.manage"], {
      blessingIouEnabled: false,
      birthdayCollectionEnabled: false,
      archiveHandoverEnabled: false,
    }).map((tool) => tool.id)).toEqual(["members"]);
  });

  it("uses encoded management URLs and does not duplicate first-level messages", () => {
    const tools = managementToolsForClub("club/with spaces", allPermissions, allFeatures);
    expect(tools.find((tool) => tool.id === "archives")?.href)
      .toBe("/clubs/club%2Fwith%20spaces/archives?mode=management");
    expect(tools.some((tool) => tool.id === "messages")).toBe(false);
  });
});

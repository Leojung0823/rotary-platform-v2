import { describe, expect, it } from "vitest";
import {
  findProductFeature,
  productFeatureFlagKeys,
  productFeaturePath,
  productFeatures,
} from "./features";

describe("product feature map", () => {
  it("keeps feature slugs unique", () => {
    const slugs = productFeatures.map((feature) => feature.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("only marks real routes as available", () => {
    for (const feature of productFeatures) {
      if (feature.status === "available") {
        expect(feature.href).toMatch(/^\//u);
      } else {
        expect(feature.href).toBeUndefined();
        expect(productFeaturePath(feature)).toBe(`/features/${feature.slug}`);
      }
    }
  });

  it("keeps all unfinished work explicitly developing", () => {
    const unfinished = productFeatures.filter((feature) => feature.status !== "available");
    expect(unfinished.length).toBeGreaterThan(0);
    expect(unfinished.every((feature) => feature.status === "developing")).toBe(true);
  });

  it("keeps birthday V2 discoverable while preserving the V1 fallback", () => {
    const birthday = productFeatures.find((feature) => feature.slug === "birthday-and-care");
    expect(birthday).toBeDefined();
    expect(productFeatureFlagKeys(birthday!)).toEqual([
      "birthday_wishes_v1",
      "birthday_wishes_v2",
    ]);
  });

  it("keeps completed flagged domains aligned with their guarded routes", () => {
    expect(findProductFeature("attendance-and-leave")).toMatchObject({
      status: "available",
      href: "/attendance",
      featureFlagKey: "attendance_ui_v2",
    });
    expect(findProductFeature("announcements-and-notifications")).toMatchObject({
      status: "available",
      href: "/messages",
      featureFlagKey: "announcements_v09",
    });
    expect(findProductFeature("blessing-iou")).toMatchObject({
      status: "available",
      href: "/blessings",
      featureFlagKey: "blessing_iou_v1",
    });
  });

});

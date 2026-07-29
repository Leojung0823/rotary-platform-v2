import { describe, expect, it } from "vitest";
import { productFeaturePath, productFeatures } from "./features";

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
});

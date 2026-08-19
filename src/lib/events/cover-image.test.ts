import { describe, expect, it } from "vitest";
import {
  COVER_MAX_EDGE,
  coverImageError,
  coverObjectPath,
  scaledDimensions,
} from "./cover-image";

describe("cover image scaling", () => {
  it("leaves an already-small picture untouched", () => {
    expect(scaledDimensions(800, 600)).toEqual({ width: 800, height: 600 });
    expect(scaledDimensions(COVER_MAX_EDGE, 900)).toEqual({ width: COVER_MAX_EDGE, height: 900 });
  });

  it("scales the long edge down and keeps the aspect ratio", () => {
    // A typical phone photo, landscape.
    expect(scaledDimensions(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    // The same photo held upright: the long edge is the height.
    expect(scaledDimensions(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });

  it("keeps an extreme panorama at least one pixel tall", () => {
    const scaled = scaledDimensions(20000, 5);
    expect(scaled.width).toBe(COVER_MAX_EDGE);
    expect(scaled.height).toBeGreaterThanOrEqual(1);
  });

  it("addresses an object by club and event so a policy can read the owner", () => {
    expect(coverObjectPath("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"))
      .toBe("11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222");
  });

  it("explains every failure the upload can surface", () => {
    for (const code of ["unsupported_type", "too_large", "decode_failed", "upload_failed", "forbidden"]) {
      expect(coverImageError(code)).not.toBe(coverImageError("unknown_code_xyz"));
    }
    expect(coverImageError("unknown_code_xyz")).toBeTruthy();
  });
});

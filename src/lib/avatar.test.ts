import { afterEach, describe, expect, it, vi } from "vitest";
import { avatarPublicUrl } from "./avatar";

describe("avatar URL boundary", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("resolves only a valid member avatar object through the configured Supabase origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.example.test/");
    expect(avatarPublicUrl("member-avatar:16400000-0000-0000-0000-000000000001/profile"))
      .toBe("https://project.example.test/storage/v1/object/public/member-avatars/16400000-0000-0000-0000-000000000001/profile");
    expect(avatarPublicUrl("member-avatar:../../secret")).toBeNull();
  });

  it("allows existing HTTP provider avatars but rejects unsafe protocols", () => {
    expect(avatarPublicUrl("https://example.test/avatar.png")).toBe("https://example.test/avatar.png");
    expect(avatarPublicUrl("javascript:alert(1)")).toBeNull();
    expect(avatarPublicUrl(null)).toBeNull();
  });
});

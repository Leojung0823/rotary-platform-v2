import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = readFileSync("supabase/config.toml", "utf8");
const template = readFileSync("supabase/templates/recovery.html", "utf8");

describe("local recovery email contract", () => {
  it("uses the app callback token hash so a GET cannot consume recovery", () => {
    expect(config).toContain("[auth.email.template.recovery]");
    expect(config).toContain('content_path = "./supabase/templates/recovery.html"');
    expect(template).toContain("/auth/callback?token_hash={{ .TokenHash }}&amp;type=recovery&amp;next=/reset-password");
    expect(template).not.toContain("/auth/v1/verify");
  });
});

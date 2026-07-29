import { describe, expect, it } from "vitest";
import { inspectBootstrapTarget } from "./bootstrap-target.mjs";

describe("superadmin bootstrap target", () => {
  it("allows local Supabase without a hosted confirmation", () => {
    expect(inspectBootstrapTarget({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      APP_ENV: "local",
    })).toMatchObject({ ok: true, target: "local" });
  });

  it("allows staging only with HTTPS and an exact hostname confirmation", () => {
    expect(inspectBootstrapTarget({
      NEXT_PUBLIC_SUPABASE_URL: "https://staging-project.supabase.co",
      APP_ENV: "staging",
      TRUSTED_ADMIN_ENVIRONMENT: "staging",
      BOOTSTRAP_CONFIRM_SUPABASE_HOST: "staging-project.supabase.co",
    })).toMatchObject({ ok: true, target: "staging", errors: [] });
  });

  it("rejects a staging hostname confirmation mismatch", () => {
    const report = inspectBootstrapTarget({
      NEXT_PUBLIC_SUPABASE_URL: "https://staging-project.supabase.co",
      APP_ENV: "staging",
      TRUSTED_ADMIN_ENVIRONMENT: "staging",
      BOOTSTRAP_CONFIRM_SUPABASE_HOST: "production-project.supabase.co",
    });
    expect(report.errors).toContain("BOOTSTRAP_HOST_CONFIRMATION_MISMATCH");
  });

  it("forbids production bootstrap even when the host is confirmed", () => {
    const report = inspectBootstrapTarget({
      NEXT_PUBLIC_SUPABASE_URL: "https://production-project.supabase.co",
      APP_ENV: "production",
      TRUSTED_ADMIN_ENVIRONMENT: "production",
      BOOTSTRAP_CONFIRM_SUPABASE_HOST: "production-project.supabase.co",
    });
    expect(report.errors).toContain("PRODUCTION_BOOTSTRAP_FORBIDDEN");
  });
});

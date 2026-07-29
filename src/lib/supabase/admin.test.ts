import { afterEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn(() => ({ configured: true }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { createLocalAdminClient, createTrustedAdminClient } from "./admin";

function configure(values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
}

afterEach(() => {
  vi.unstubAllEnvs();
  createClient.mockClear();
});

describe("Supabase admin boundaries", () => {
  it("allows trusted local operations without a hosted approval flag", () => {
    configure({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SERVICE_ROLE_KEY: "local-service-role",
      APP_ENV: "local",
      TRUSTED_ADMIN_ENVIRONMENT: "",
    });
    expect(createTrustedAdminClient()).toEqual({ configured: true });
  });

  it("allows HTTPS staging only when the trusted boundary matches exactly", () => {
    configure({
      NEXT_PUBLIC_SUPABASE_URL: "https://staging-project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "staging-service-role",
      APP_ENV: "staging",
      TRUSTED_ADMIN_ENVIRONMENT: "staging",
    });
    expect(createTrustedAdminClient()).toEqual({ configured: true });
  });

  it("rejects staging when the trusted boundary is missing or mismatched", () => {
    configure({
      NEXT_PUBLIC_SUPABASE_URL: "https://staging-project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "staging-service-role",
      APP_ENV: "staging",
      TRUSTED_ADMIN_ENVIRONMENT: "production",
    });
    expect(createTrustedAdminClient).toThrow("exact hosted environment boundary");
  });

  it("rejects non-local trusted admin over HTTP", () => {
    configure({
      NEXT_PUBLIC_SUPABASE_URL: "http://staging-project.example.com",
      SUPABASE_SERVICE_ROLE_KEY: "staging-service-role",
      APP_ENV: "staging",
      TRUSTED_ADMIN_ENVIRONMENT: "staging",
    });
    expect(createTrustedAdminClient).toThrow("require HTTPS Supabase");
  });

  it("keeps local-only admin operations restricted to local Supabase", () => {
    configure({
      NEXT_PUBLIC_SUPABASE_URL: "https://production-project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "production-service-role",
      APP_ENV: "production",
      TRUSTED_ADMIN_ENVIRONMENT: "production",
    });
    expect(createLocalAdminClient).toThrow("restricted to local Supabase");
  });
});

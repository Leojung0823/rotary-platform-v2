import { describe, expect, it, vi } from "vitest";
import {
  inspectStagingProjectIdentityInput,
  verifyStagingProjectIdentity,
} from "./staging-project-identity.mjs";

const projectRef = "abcdefghijklmnopqrst";

function validInput() {
  return {
    APP_ENV: "staging",
    TRUSTED_ADMIN_ENVIRONMENT: "staging",
    SUPABASE_PROJECT_REF: projectRef,
    NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
    SUPABASE_ACCESS_TOKEN: "management-token-".padEnd(40, "x"),
  };
}

function response(overrides = {}) {
  return new Response(JSON.stringify({
    id: projectRef,
    ref: projectRef,
    name: "Rotary Platform Staging",
    status: "ACTIVE_HEALTHY",
    database: { host: `db.${projectRef}.supabase.co` },
    ...overrides,
  }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("staging Supabase project identity", () => {
  it("accepts only the matching active staging project", async () => {
    const fetchImpl = vi.fn(async () => response());
    const result = await verifyStagingProjectIdentity(validInput(), { fetchImpl });
    expect(result).toMatchObject({
      ok: true,
      projectRefSuffix: "qrst",
      supabaseOrigin: `https://${projectRef}.supabase.co`,
      projectConnectable: true,
      errors: [],
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.supabase.com/v1/projects/${projectRef}`,
      expect.objectContaining({ redirect: "error" }),
    );
  });

  it("requires a project name containing staging", async () => {
    const result = await verifyStagingProjectIdentity(validInput(), {
      fetchImpl: async () => response({ name: "Rotary Production" }),
    });
    expect(result.errors).toContain("PROJECT_NAME_NOT_STAGING");
  });

  it("rejects returned ref and database-host mismatches", async () => {
    const result = await verifyStagingProjectIdentity(validInput(), {
      fetchImpl: async () => response({ ref: "bbbbbbbbbbbbbbbbbbbb", database: { host: "db.other.supabase.co" } }),
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      "PROJECT_METADATA_REF_MISMATCH",
      "PROJECT_DATABASE_HOST_MISMATCH",
    ]));
  });

  it("permanently rejects production and configured production identifiers", () => {
    const production = inspectStagingProjectIdentityInput({
      ...validInput(),
      APP_ENV: "production",
      TRUSTED_ADMIN_ENVIRONMENT: "production",
      PRODUCTION_SUPABASE_PROJECT_REFS: `other,${projectRef}`,
      PRODUCTION_SUPABASE_URL: `https://${projectRef}.supabase.co`,
    });
    expect(production.errors).toEqual(expect.arrayContaining([
      "PRODUCTION_PROJECT_FORBIDDEN",
      "STAGING_APP_ENV_REQUIRED",
      "STAGING_TRUSTED_BOUNDARY_REQUIRED",
      "PRODUCTION_PROJECT_IDENTIFIER_MATCH",
    ]));
  });

  it("rejects hostname mismatch and non-connectable metadata", async () => {
    const local = inspectStagingProjectIdentityInput({
      ...validInput(),
      NEXT_PUBLIC_SUPABASE_URL: "https://bbbbbbbbbbbbbbbbbbbb.supabase.co",
    });
    expect(local.errors).toContain("STAGING_SUPABASE_HOST_REF_MISMATCH");

    const remote = await verifyStagingProjectIdentity(validInput(), {
      fetchImpl: async () => response({ status: "INACTIVE" }),
    });
    expect(remote.errors).toContain("PROJECT_STATUS_NOT_CONNECTABLE");
  });

  it("fails closed for network, authorization, missing and malformed responses", async () => {
    for (const fetchImpl of [
      async () => { throw new Error("network"); },
      async () => new Response("unauthorized", { status: 401 }),
      async () => new Response("forbidden", { status: 403 }),
      async () => new Response("missing", { status: 404 }),
    ]) {
      const result = await verifyStagingProjectIdentity(validInput(), { fetchImpl });
      expect(result.errors).toEqual(["PROJECT_METADATA_REQUEST_FAILED"]);
    }
    const malformed = await verifyStagingProjectIdentity(validInput(), {
      fetchImpl: async () => new Response("not-json", { status: 200 }),
    });
    expect(malformed.errors).toEqual(["PROJECT_METADATA_INVALID"]);
  });

  it("never returns the access token or API response", async () => {
    const secret = "management-token-do-not-serialize";
    const result = await verifyStagingProjectIdentity({
      ...validInput(),
      SUPABASE_ACCESS_TOKEN: secret,
    }, { fetchImpl: async () => response({ hidden: secret }) });
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});

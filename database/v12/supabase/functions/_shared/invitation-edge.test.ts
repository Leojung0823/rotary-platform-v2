import { afterEach, describe, expect, it, vi } from "vitest"
import {
  assertInvitationHmacRuntimeConfiguration,
  callInvitationValidationRpc,
  handleInvitationRequest,
  hashCanonicalRequest,
  INVITATION_INTERNAL_FETCH_TIMEOUT_MS,
  InvitationAuthenticationError,
  invitationValidationErrorResponse,
  jsonResponse,
  loadInvitationHmacIssuingKey,
  loadInvitationHmacSecret,
  PUBLIC_INVITATION_ELIGIBILITY_ERROR,
  readJsonObject,
  requireAuthenticatedUser,
  requireOnlyKeys,
  serveInvitationHandler,
} from "./invitation-edge.ts"
import { encodeBase64Url, InvitationTokenError } from "./invitation-token.ts"

const keyV1 = Uint8Array.from({ length: 32 }, (_, index) => index + 1)
const keyV2 = Uint8Array.from({ length: 32 }, (_, index) => 255 - index)
const invalidConfigurations: Array<[Record<string, string>, string]> = [
  [{}, "missing configuration"],
  [{
    INVITATION_HMAC_CURRENT_KEY_VERSION: "2",
    INVITATION_HMAC_ACCEPTED_KEY_VERSIONS: "1",
    INVITATION_HMAC_SECRET_V1: encodeBase64Url(keyV1),
  }, "current version outside the accepted window"],
  [{
    INVITATION_HMAC_CURRENT_KEY_VERSION: "2",
    INVITATION_HMAC_ACCEPTED_KEY_VERSIONS: "1,1,2",
    INVITATION_HMAC_SECRET_V1: encodeBase64Url(keyV1),
    INVITATION_HMAC_SECRET_V2: encodeBase64Url(keyV2),
  }, "duplicate accepted versions"],
  [{
    INVITATION_HMAC_CURRENT_KEY_VERSION: "2",
    INVITATION_HMAC_ACCEPTED_KEY_VERSIONS: "1,2",
    INVITATION_HMAC_SECRET_V1: encodeBase64Url(keyV1),
  }, "missing accepted secret"],
]

function installEnvironment(values: Record<string, string>): void {
  vi.stubGlobal("Deno", {
    env: { get: (name: string) => values[name] },
    serve: vi.fn(),
  })
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("Invitation Edge boundary", () => {
  it("rejects non-POST requests before invitation business logic runs", async () => {
    const serve = vi.fn()
    const handler = vi.fn(async () => jsonResponse({ ok: true }))
    vi.stubGlobal("Deno", {
      env: { get: () => undefined },
      serve,
    })

    serveInvitationHandler(handler)
    const registered = serve.mock.calls[0]?.[0] as (
      request: Request,
    ) => Promise<Response>
    const response = await registered(new Request("http://localhost", {
      method: "GET",
    }))

    expect(handler).not.toHaveBeenCalled()
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "INVITATION_INVALID_OR_UNAVAILABLE",
      message: "Invitation is invalid or unavailable.",
    })
  })

  it("uses one current issuing key while accepting an explicit rotation window", () => {
    installEnvironment({
      INVITATION_HMAC_CURRENT_KEY_VERSION: "2",
      INVITATION_HMAC_ACCEPTED_KEY_VERSIONS: "1,2",
      INVITATION_HMAC_SECRET_V1: encodeBase64Url(keyV1),
      INVITATION_HMAC_SECRET_V2: encodeBase64Url(keyV2),
    })

    expect(assertInvitationHmacRuntimeConfiguration().acceptedKeyVersions)
      .toEqual(new Set([1, 2]))
    expect(loadInvitationHmacIssuingKey()).toEqual({
      hmacKeyVersion: 2,
      secret: keyV2,
    })
    expect(loadInvitationHmacSecret(1)).toEqual(keyV1)
  })

  it("rejects a key version after it is removed from the accepted window", () => {
    installEnvironment({
      INVITATION_HMAC_CURRENT_KEY_VERSION: "2",
      INVITATION_HMAC_ACCEPTED_KEY_VERSIONS: "2",
      INVITATION_HMAC_SECRET_V2: encodeBase64Url(keyV2),
    })

    expect(() => loadInvitationHmacSecret(1)).toThrow(InvitationTokenError)
  })

  it.each(invalidConfigurations)("fails closed for %s", (values) => {
    installEnvironment(values)
    expect(() => assertInvitationHmacRuntimeConfiguration())
      .toThrow("INVITATION_RUNTIME_CONFIGURATION")
  })

  it("hashes canonical requests independent of object insertion order", async () => {
    expect(await hashCanonicalRequest({ b: 2, a: { d: 4, c: 3 } }))
      .toEqual(await hashCanonicalRequest({ a: { c: 3, d: 4 }, b: 2 }))
  })

  it("fingerprints every non-secret Validate token and actor metadata field", async () => {
    const baseline = {
      operation: "invitation_validate",
      invitation_id: "91000000-0000-4000-8000-000000000001",
      actor_auth_user_id: "91000000-0000-4000-8000-000000000002",
      token_hash: "\\x" + "11".repeat(32),
      token_version: 1,
      hmac_key_version: 2,
      token_issued_at: "2026-07-22T00:00:00.000Z",
      token_expires_at: "2026-07-23T00:00:00.000Z",
    }
    const baselineHash = await hashCanonicalRequest(baseline)

    for (const changed of [
      { ...baseline, invitation_id: "91000000-0000-4000-8000-000000000003" },
      { ...baseline, actor_auth_user_id: "91000000-0000-4000-8000-000000000004" },
      { ...baseline, token_hash: "\\x" + "12".repeat(32) },
      { ...baseline, token_version: 2 },
      { ...baseline, hmac_key_version: 3 },
      { ...baseline, token_issued_at: "2026-07-22T00:00:01.000Z" },
      { ...baseline, token_expires_at: "2026-07-23T00:00:01.000Z" },
    ]) {
      expect(await hashCanonicalRequest(changed)).not.toEqual(baselineHash)
    }
  })

  it("accepts only bounded application/json request bodies", async () => {
    await expect(readJsonObject(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ invitation_id: "value" }),
    }))).resolves.toEqual({ invitation_id: "value" })

    await expect(readJsonObject(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    }))).rejects.toBeInstanceOf(InvitationTokenError)

    await expect(readJsonObject(new Request("http://localhost", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "16385",
      },
      body: "{}",
    }))).rejects.toBeInstanceOf(InvitationTokenError)

    await expect(readJsonObject(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(16_385) }),
    }))).rejects.toBeInstanceOf(InvitationTokenError)
  })

  it("rejects caller-supplied Auth, Account, or Person identifiers", () => {
    expect(() => requireOnlyKeys({
      token: "synthetic",
      idempotency_key: "validate-key-0001",
      auth_user_id: "91000000-0000-4000-8000-000000000001",
    }, ["token", "idempotency_key"])).toThrow(InvitationTokenError)
    expect(() => requireOnlyKeys({
      token: "synthetic",
      idempotency_key: "validate-key-0001",
      account_id: "91000000-0000-4000-8000-000000000002",
    }, ["token", "idempotency_key"])).toThrow(InvitationTokenError)
    expect(() => requireOnlyKeys({
      token: "synthetic",
      idempotency_key: "validate-key-0001",
      person_id: "91000000-0000-4000-8000-000000000003",
    }, ["token", "idempotency_key"])).toThrow(InvitationTokenError)
    expect(() => requireOnlyKeys({
      token: "synthetic",
      idempotency_key: "validate-key-0001",
      unexpected: "fail-closed",
    }, ["token", "idempotency_key"])).toThrow(InvitationTokenError)
  })

  it("aborts a stalled Auth user lookup at the fixed internal timeout", async () => {
    vi.useFakeTimers()
    installEnvironment({
      SUPABASE_URL: "http://127.0.0.1:55321",
      SUPABASE_ANON_KEY: "synthetic-anon-key",
    })
    const fetchMock = vi.fn((_input: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"))
        })
      }))
    vi.stubGlobal("fetch", fetchMock)

    const lookup = requireAuthenticatedUser(new Request("http://localhost", {
      headers: { authorization: "Bearer synthetic-jwt" },
    }))
    const rejection = expect(lookup).rejects.toBeInstanceOf(InvitationAuthenticationError)
    await vi.advanceTimersByTimeAsync(INVITATION_INTERNAL_FETCH_TIMEOUT_MS)
    await rejection

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  })

  it("validates the non-consuming preflight RPC response contract", async () => {
    installEnvironment({
      SUPABASE_URL: "http://127.0.0.1:55321",
      SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key",
    })
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{
      invitation_id: "91000000-0000-4000-8000-000000000001",
      invitation_error_code: null,
      invitation_is_idempotent_retry: false,
      invitation_is_valid: true,
      invitation_can_attempt_onboarding: true,
      invitation_validated_at: "2026-07-22T00:00:00.000Z",
    }]), { status: 200 })))

    await expect(callInvitationValidationRpc({ p_value: "synthetic" }))
      .resolves.toMatchObject({
        invitation_is_idempotent_retry: false,
        invitation_is_valid: true,
        invitation_can_attempt_onboarding: true,
      })
  })

  it("collapses every public eligibility failure to one byte-identical response", async () => {
    const tokenFailures = new Set([
      "malformed token",
      "invalid signature",
      "unknown token version",
      "unknown HMAC key version",
    ])
    const cases = [
      ["not found", "INVITATION_NOT_FOUND"],
      ["malformed token", "INVITATION_INVALID_SIGNATURE"],
      ["invalid signature", "INVITATION_INVALID_SIGNATURE"],
      ["expired", "INVITATION_EXPIRED"],
      ["revoked", "INVITATION_REVOKED"],
      ["accepted fixture", "INVITATION_ALREADY_ACCEPTED"],
      ["unknown token version", "INVITATION_INVALID_SIGNATURE"],
      ["unknown HMAC key version", "INVITATION_INVALID_SIGNATURE"],
      ["wrong storage hash", "INVITATION_INVALID_SIGNATURE"],
      ["old token after resend", "INVITATION_INVALID_SIGNATURE"],
    ] as const
    const expectedBody = JSON.stringify(PUBLIC_INVITATION_ELIGIBILITY_ERROR)
    const canonicalHeaders = {
      contentType: "application/json; charset=utf-8",
      cacheControl: "no-store, max-age=0",
      pragma: "no-cache",
      contentTypeOptions: "nosniff",
    }

    for (const [label, code] of cases) {
      const response = tokenFailures.has(label)
        ? await handleInvitationRequest(
          new Request("http://localhost", { method: "POST" }),
          async () => { throw new InvitationTokenError() },
        )
        : invitationValidationErrorResponse(code)
      const serializedBody = await response.clone().text()
      const parsedBody = await response.json() as Record<string, unknown>

      expect(response.status, label).toBe(404)
      expect(serializedBody, label).toBe(expectedBody)
      expect(Object.keys(parsedBody), label).toEqual(["ok", "code", "message"])
      expect(parsedBody, label).toEqual(PUBLIC_INVITATION_ELIGIBILITY_ERROR)
      expect(typeof parsedBody.ok, label).toBe("boolean")
      expect(typeof parsedBody.code, label).toBe("string")
      expect(typeof parsedBody.message, label).toBe("string")
      expect(response.headers.get("content-type"), label).toBe(canonicalHeaders.contentType)
      expect(response.headers.get("cache-control"), label).toBe(canonicalHeaders.cacheControl)
      expect(response.headers.get("pragma"), label).toBe(canonicalHeaders.pragma)
      expect(response.headers.get("x-content-type-options"), label)
        .toBe(canonicalHeaders.contentTypeOptions)
      expect(Object.keys(parsedBody), label).not.toContain("internal_reason")
      expect(Object.keys(parsedBody), label).not.toContain("invitation_id")
      expect(serializedBody.length, label).toBe(expectedBody.length)
    }
  })

  it("keeps authentication and idempotency failures outside eligibility collapse", async () => {
    const authentication = await handleInvitationRequest(
      new Request("http://localhost", { method: "POST" }),
      requireAuthenticatedUser as unknown as (request: Request) => Promise<Response>,
    )
    expect(authentication.status).toBe(401)
    await expect(authentication.json()).resolves.toEqual({
      ok: false,
      code: "AUTHENTICATION_REQUIRED",
      message: "Authentication is required.",
    })

    const conflict = invitationValidationErrorResponse("INVITATION_IDEMPOTENCY_CONFLICT")
    expect(conflict.status).toBe(409)
    await expect(conflict.json()).resolves.toEqual({
      error_code: "INVITATION_IDEMPOTENCY_CONFLICT",
    })
  })

  it("marks every JSON response as non-cacheable", () => {
    const response = jsonResponse({ value: "synthetic" })
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0")
    expect(response.headers.get("pragma")).toBe("no-cache")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
  })
})

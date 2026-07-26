import {
  decodeBase64Url,
  InvitationTokenError,
} from "./invitation-token.ts"

type DenoRuntime = {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Response | Promise<Response>): void
}

export type InvitationRpcResult = {
  invitation_id: string | null
  invitation_status: string | null
  invitation_error_code: string | null
  invitation_is_replay: boolean
}

export type InvitationValidationRpcResult = {
  invitation_id: string | null
  invitation_error_code: string | null
  invitation_is_idempotent_retry: boolean
  invitation_is_valid: boolean
  invitation_can_attempt_onboarding: boolean
  invitation_validated_at: string | null
}

export const PUBLIC_INVITATION_ELIGIBILITY_ERROR = {
  ok: false,
  code: "INVITATION_INVALID_OR_UNAVAILABLE",
  message: "Invitation is invalid or unavailable.",
} as const

const INVITATION_ELIGIBILITY_ERROR_CODES = new Set([
  "INVITATION_NOT_FOUND",
  "INVITATION_EXPIRED",
  "INVITATION_REVOKED",
  "INVITATION_ALREADY_ACCEPTED",
  "INVITATION_INVALID_SIGNATURE",
  "INVITATION_REPLAY",
])

export class InvitationAuthenticationError extends Error {
  constructor() {
    super("AUTHENTICATION_REQUIRED")
    this.name = "InvitationAuthenticationError"
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/
const INVITATION_STATUSES = new Set(["pending", "accepted", "expired", "revoked"])
const HMAC_VERSION_PATTERN = /^[1-9][0-9]{0,4}$/
const MAX_ACCEPTED_HMAC_KEY_VERSIONS = 4
const MAX_JSON_BODY_BYTES = 16_384
export const INVITATION_INTERNAL_FETCH_TIMEOUT_MS = 5_000
const INVITATION_ERROR_CODES = new Set([
  "INVITATION_NOT_FOUND",
  "INVITATION_EXPIRED",
  "INVITATION_REVOKED",
  "INVITATION_ALREADY_ACCEPTED",
  "INVITATION_INVALID_SIGNATURE",
  "INVITATION_REPLAY",
  "INVITATION_IDEMPOTENCY_CONFLICT",
])

function denoRuntime(): DenoRuntime {
  return (globalThis as unknown as { Deno: DenoRuntime }).Deno
}

export function serveInvitationHandler(
  handler: (request: Request) => Promise<Response>,
): void {
  denoRuntime().serve((request) => handleInvitationRequest(request, handler))
}

export async function handleInvitationRequest(
  request: Request,
  handler: (request: Request) => Promise<Response>,
): Promise<Response> {
  try {
    if (request.method !== "POST") {
      return publicInvitationEligibilityErrorResponse()
    }
    return await handler(request)
  } catch (error) {
    if (error instanceof InvitationAuthenticationError) {
      return authenticationErrorResponse()
    }
    if (error instanceof InvitationTokenError) {
      return publicInvitationEligibilityErrorResponse()
    }
    return publicInvitationEligibilityErrorResponse()
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      pragma: "no-cache",
      "x-content-type-options": "nosniff",
    },
  })
}

export function invitationErrorResponse(code: string): Response {
  const status = new Map<string, number>([
    ["INVITATION_NOT_FOUND", 404],
    ["INVITATION_EXPIRED", 410],
    ["INVITATION_REVOKED", 409],
    ["INVITATION_ALREADY_ACCEPTED", 409],
    ["INVITATION_INVALID_SIGNATURE", 401],
    ["INVITATION_REPLAY", 409],
    ["INVITATION_IDEMPOTENCY_CONFLICT", 409],
  ]).get(code) ?? 500
  return jsonResponse({ error_code: code }, status)
}

export function publicInvitationEligibilityErrorResponse(): Response {
  return jsonResponse(PUBLIC_INVITATION_ELIGIBILITY_ERROR, 404)
}

export function invitationValidationErrorResponse(code: string): Response {
  if (INVITATION_ELIGIBILITY_ERROR_CODES.has(code)) {
    return publicInvitationEligibilityErrorResponse()
  }
  return invitationErrorResponse(code)
}

export function authenticationErrorResponse(): Response {
  return jsonResponse({
    ok: false,
    code: "AUTHENTICATION_REQUIRED",
    message: "Authentication is required.",
  }, 401)
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase()
  if (contentType !== "application/json") throw new InvitationTokenError()
  const contentLength = Number(request.headers.get("content-length") ?? "0")
  if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > MAX_JSON_BODY_BYTES) {
    throw new InvitationTokenError()
  }
  const reader = request.body?.getReader()
  if (!reader) throw new InvitationTokenError()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > MAX_JSON_BODY_BYTES) {
        await reader.cancel()
        throw new InvitationTokenError()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  const text = new TextDecoder().decode(bytes)
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new InvitationTokenError()
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvitationTokenError()
  }
  return value as Record<string, unknown>
}

export function requireUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new InvitationTokenError()
  }
  return value
}

export function requireIdempotencyKey(value: unknown): string {
  if (typeof value !== "string" || !IDEMPOTENCY_PATTERN.test(value)) {
    throw new InvitationTokenError()
  }
  return value
}

export function requireExpirySeconds(value: unknown): number {
  const seconds = value === undefined ? 86_400 : value
  if (!Number.isSafeInteger(seconds) || (seconds as number) < 900 || (seconds as number) > 604_800) {
    throw new InvitationTokenError()
  }
  return seconds as number
}

export function requireOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): void {
  const allowed = new Set(allowedKeys)
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new InvitationTokenError()
  }
}

function requireRuntimeEnv(name: string): string {
  const value = denoRuntime().env.get(name)
  if (!value) throw new Error("INVITATION_RUNTIME_CONFIGURATION")
  return value
}

export type InvitationHmacConfiguration = {
  currentKeyVersion: number
  acceptedKeyVersions: ReadonlySet<number>
}

function parseHmacKeyVersion(value: string): number {
  if (!HMAC_VERSION_PATTERN.test(value)) throw new Error("INVITATION_RUNTIME_CONFIGURATION")
  const version = Number(value)
  if (!Number.isSafeInteger(version) || version > 32_767) {
    throw new Error("INVITATION_RUNTIME_CONFIGURATION")
  }
  return version
}

export function loadInvitationHmacConfiguration(): InvitationHmacConfiguration {
  const currentKeyVersion = parseHmacKeyVersion(
    requireRuntimeEnv("INVITATION_HMAC_CURRENT_KEY_VERSION"),
  )
  const acceptedRaw = requireRuntimeEnv("INVITATION_HMAC_ACCEPTED_KEY_VERSIONS")
  if (!/^[1-9][0-9]{0,4}(,[1-9][0-9]{0,4})*$/u.test(acceptedRaw)) {
    throw new Error("INVITATION_RUNTIME_CONFIGURATION")
  }
  const versions = acceptedRaw.split(",").map(parseHmacKeyVersion)
  const acceptedKeyVersions = new Set(versions)
  if (
    acceptedKeyVersions.size !== versions.length
    || acceptedKeyVersions.size > MAX_ACCEPTED_HMAC_KEY_VERSIONS
    || !acceptedKeyVersions.has(currentKeyVersion)
  ) {
    throw new Error("INVITATION_RUNTIME_CONFIGURATION")
  }
  return { currentKeyVersion, acceptedKeyVersions }
}

function loadConfiguredSecret(hmacKeyVersion: number): Uint8Array {
  const encoded = requireRuntimeEnv(`INVITATION_HMAC_SECRET_V${hmacKeyVersion}`)
  const secret = decodeBase64Url(encoded)
  if (secret.byteLength < 32) throw new Error("INVITATION_RUNTIME_CONFIGURATION")
  return secret
}

export function assertInvitationHmacRuntimeConfiguration(): InvitationHmacConfiguration {
  const configuration = loadInvitationHmacConfiguration()
  for (const version of configuration.acceptedKeyVersions) loadConfiguredSecret(version)
  return configuration
}

export function loadInvitationHmacIssuingKey(): {
  hmacKeyVersion: number
  secret: Uint8Array
} {
  const configuration = assertInvitationHmacRuntimeConfiguration()
  return {
    hmacKeyVersion: configuration.currentKeyVersion,
    secret: loadConfiguredSecret(configuration.currentKeyVersion),
  }
}

export function loadInvitationHmacSecret(hmacKeyVersion: number): Uint8Array {
  const configuration = loadInvitationHmacConfiguration()
  if (!configuration.acceptedKeyVersions.has(hmacKeyVersion)) {
    throw new InvitationTokenError()
  }
  return loadConfiguredSecret(hmacKeyVersion)
}

export async function requireAuthenticatedUser(request: Request): Promise<string> {
  const authorization = request.headers.get("authorization")
  if (!authorization?.startsWith("Bearer ")) throw new InvitationAuthenticationError()

  let response: Response
  try {
    response = await internalFetch(`${requireRuntimeEnv("SUPABASE_URL")}/auth/v1/user`, {
      headers: {
        authorization,
        apikey: requireRuntimeEnv("SUPABASE_ANON_KEY"),
      },
    })
  } catch {
    throw new InvitationAuthenticationError()
  }
  if (!response.ok) throw new InvitationAuthenticationError()
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new InvitationAuthenticationError()
  }
  if (typeof body !== "object" || body === null || !("id" in body)) {
    throw new InvitationAuthenticationError()
  }
  try {
    return requireUuid((body as { id: unknown }).id)
  } catch {
    throw new InvitationAuthenticationError()
  }
}

async function internalFetch(
  input: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    INVITATION_INTERNAL_FETCH_TIMEOUT_MS,
  )
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function callInvitationRpcRecord(
  functionName: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const serviceRoleKey = requireRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY")
  let response: Response
  try {
    response = await internalFetch(
      `${requireRuntimeEnv("SUPABASE_URL")}/rest/v1/rpc/${functionName}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(body),
      },
    )
  } catch {
    throw new Error("INVITATION_DATABASE_CONTRACT")
  }
  if (!response.ok) throw new Error("INVITATION_DATABASE_CONTRACT")
  let value: unknown
  try {
    value = await response.json()
  } catch {
    throw new Error("INVITATION_DATABASE_CONTRACT")
  }
  const record = Array.isArray(value) ? value[0] : value
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    throw new Error("INVITATION_DATABASE_CONTRACT")
  }
  return record as Record<string, unknown>
}

export async function callInvitationRpc(
  functionName: string,
  body: Record<string, unknown>,
): Promise<InvitationRpcResult> {
  const candidate = (
    await callInvitationRpcRecord(functionName, body)
  ) as Partial<InvitationRpcResult>
  if (
    typeof candidate.invitation_is_replay !== "boolean"
    || (candidate.invitation_id !== null && typeof candidate.invitation_id !== "string")
    || (
      candidate.invitation_status !== null
      && (
        typeof candidate.invitation_status !== "string"
        || !INVITATION_STATUSES.has(candidate.invitation_status)
      )
    )
    || (
      candidate.invitation_error_code !== null
      && (
        typeof candidate.invitation_error_code !== "string"
        || !INVITATION_ERROR_CODES.has(candidate.invitation_error_code)
      )
    )
  ) {
    throw new Error("INVITATION_DATABASE_CONTRACT")
  }
  return candidate as InvitationRpcResult
}

export async function callInvitationValidationRpc(
  body: Record<string, unknown>,
): Promise<InvitationValidationRpcResult> {
  const candidate = (
    await callInvitationRpcRecord("validate_membership_invitation", body)
  ) as Partial<InvitationValidationRpcResult>
  if (
    typeof candidate.invitation_is_idempotent_retry !== "boolean"
    || typeof candidate.invitation_is_valid !== "boolean"
    || typeof candidate.invitation_can_attempt_onboarding !== "boolean"
    || (candidate.invitation_id !== null && typeof candidate.invitation_id !== "string")
    || (
      candidate.invitation_error_code !== null
      && (
        typeof candidate.invitation_error_code !== "string"
        || !INVITATION_ERROR_CODES.has(candidate.invitation_error_code)
      )
    )
    || (
      candidate.invitation_validated_at !== null
      && (
        typeof candidate.invitation_validated_at !== "string"
        || !Number.isFinite(Date.parse(candidate.invitation_validated_at))
      )
    )
  ) {
    throw new Error("INVITATION_DATABASE_CONTRACT")
  }
  return candidate as InvitationValidationRpcResult
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (typeof value !== "object" || value === null) return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]),
  )
}

export async function hashCanonicalRequest(value: unknown): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(canonicalize(value))),
  )
  return new Uint8Array(digest)
}

export function toPostgresBytea(value: Uint8Array): string {
  return `\\x${Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("")}`
}

export function isoTimestamp(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString()
}

export const INVITATION_TOKEN_VERSION = 1

const SIGNATURE_DOMAIN = "rotary-v12-invitation-signature\0"
const STORAGE_HASH_DOMAIN = "rotary-v12-invitation-storage\0"
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/
const MAX_TIMESTAMP_SECONDS = 253_402_300_799

export type InvitationTokenPayload = {
  invitation_id: string
  issued_at: number
  expires_at: number
  nonce: string
  version: number
}

export type InvitationTokenMaterial = {
  token: string
  tokenHash: Uint8Array
  tokenVersion: number
  hmacKeyVersion: number
  payload: InvitationTokenPayload
}

export class InvitationTokenError extends Error {
  readonly code = "INVITATION_INVALID_SIGNATURE"

  constructor() {
    super("INVITATION_INVALID_SIGNATURE")
    this.name = "InvitationTokenError"
  }
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "")
}

export function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new InvitationTokenError()
  const padded = value.replaceAll("-", "+").replaceAll("_", "/")
    + "=".repeat((4 - (value.length % 4)) % 4)
  let binary: string
  try {
    binary = atob(padded)
  } catch {
    throw new InvitationTokenError()
  }
  const decoded = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  if (encodeBase64Url(decoded) !== value) throw new InvitationTokenError()
  return decoded
}

function encodeJson(payload: InvitationTokenPayload): string {
  const canonical = JSON.stringify({
    expires_at: payload.expires_at,
    invitation_id: payload.invitation_id,
    issued_at: payload.issued_at,
    nonce: payload.nonce,
    version: payload.version,
  })
  return encodeBase64Url(new TextEncoder().encode(canonical))
}

function decodePayload(value: string, tokenVersion: number): InvitationTokenPayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(decodeBase64Url(value)))
  } catch {
    throw new InvitationTokenError()
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new InvitationTokenError()
  }
  const record = parsed as Record<string, unknown>
  const keys = Object.keys(record).sort().join(",")
  if (keys !== "expires_at,invitation_id,issued_at,nonce,version") {
    throw new InvitationTokenError()
  }
  if (
    typeof record.invitation_id !== "string"
    || !UUID_PATTERN.test(record.invitation_id)
    || typeof record.issued_at !== "number"
    || !Number.isSafeInteger(record.issued_at)
    || record.issued_at <= 0
    || record.issued_at > MAX_TIMESTAMP_SECONDS
    || typeof record.expires_at !== "number"
    || !Number.isSafeInteger(record.expires_at)
    || record.expires_at > MAX_TIMESTAMP_SECONDS
    || record.expires_at <= record.issued_at
    || typeof record.nonce !== "string"
    || !NONCE_PATTERN.test(record.nonce)
    || decodeBase64Url(record.nonce).length !== 32
    || record.version !== tokenVersion
  ) {
    throw new InvitationTokenError()
  }

  const payload = {
    invitation_id: record.invitation_id,
    issued_at: record.issued_at,
    expires_at: record.expires_at,
    nonce: record.nonce,
    version: record.version,
  }
  if (encodeJson(payload) !== value) throw new InvitationTokenError()
  return payload
}

async function importHmacKey(secret: Uint8Array): Promise<CryptoKey> {
  if (secret.byteLength < 32) throw new InvitationTokenError()
  return crypto.subtle.importKey(
    "raw",
    new Uint8Array(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  )
}

async function signHmac(secret: Uint8Array, value: string): Promise<Uint8Array> {
  const key = await importHmacKey(secret)
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  )
  return new Uint8Array(signature)
}

async function verifyHmac(
  secret: Uint8Array,
  value: string,
  signature: Uint8Array,
): Promise<boolean> {
  const key = await importHmacKey(secret)
  return crypto.subtle.verify(
    "HMAC",
    key,
    new Uint8Array(signature),
    new TextEncoder().encode(value),
  )
}

export function parseInvitationTokenHeader(token: string): {
  tokenVersion: number
  hmacKeyVersion: number
} {
  if (token.length > 4096) throw new InvitationTokenError()
  const segments = token.split(".")
  if (segments.length !== 4) throw new InvitationTokenError()
  const tokenMatch = /^v([1-9][0-9]*)$/u.exec(segments[0])
  const keyMatch = /^k([1-9][0-9]*)$/u.exec(segments[1])
  if (!tokenMatch || !keyMatch) throw new InvitationTokenError()
  const tokenVersion = Number(tokenMatch[1])
  const hmacKeyVersion = Number(keyMatch[1])
  if (
    !Number.isSafeInteger(tokenVersion)
    || tokenVersion !== INVITATION_TOKEN_VERSION
    || !Number.isSafeInteger(hmacKeyVersion)
    || hmacKeyVersion > 32_767
  ) {
    throw new InvitationTokenError()
  }
  return {
    tokenVersion,
    hmacKeyVersion,
  }
}

export async function issueInvitationToken(input: {
  invitationId: string
  issuedAt: Date
  expiresAt: Date
  secret: Uint8Array
  hmacKeyVersion: number
  nonceBytes?: Uint8Array
}): Promise<InvitationTokenMaterial> {
  const tokenVersion = INVITATION_TOKEN_VERSION
  const hmacKeyVersion = input.hmacKeyVersion
  const nonceBytes = input.nonceBytes ?? crypto.getRandomValues(new Uint8Array(32))
  const issuedAt = Math.floor(input.issuedAt.getTime() / 1000)
  const expiresAt = Math.floor(input.expiresAt.getTime() / 1000)

  if (
    !UUID_PATTERN.test(input.invitationId)
    || !Number.isSafeInteger(issuedAt)
    || issuedAt <= 0
    || issuedAt > MAX_TIMESTAMP_SECONDS
    || !Number.isSafeInteger(expiresAt)
    || expiresAt > MAX_TIMESTAMP_SECONDS
    || expiresAt <= issuedAt
    || nonceBytes.byteLength !== 32
    || !Number.isSafeInteger(hmacKeyVersion)
    || hmacKeyVersion <= 0
    || hmacKeyVersion > 32_767
  ) {
    throw new InvitationTokenError()
  }

  const payload: InvitationTokenPayload = {
    invitation_id: input.invitationId,
    issued_at: issuedAt,
    expires_at: expiresAt,
    nonce: encodeBase64Url(nonceBytes),
    version: tokenVersion,
  }
  const encodedPayload = encodeJson(payload)
  const signingInput = `v${tokenVersion}.k${hmacKeyVersion}.${encodedPayload}`
  const signature = await signHmac(input.secret, SIGNATURE_DOMAIN + signingInput)
  const token = `${signingInput}.${encodeBase64Url(signature)}`
  const tokenHash = await signHmac(input.secret, STORAGE_HASH_DOMAIN + token)

  return { token, tokenHash, tokenVersion, hmacKeyVersion, payload }
}

export async function verifyInvitationToken(
  token: string,
  resolveSecret: (hmacKeyVersion: number) => Uint8Array,
): Promise<InvitationTokenMaterial> {
  const { tokenVersion, hmacKeyVersion } = parseInvitationTokenHeader(token)
  const segments = token.split(".")
  const signingInput = segments.slice(0, 3).join(".")
  const signature = decodeBase64Url(segments[3])
  if (signature.byteLength !== 32) throw new InvitationTokenError()

  const secret = resolveSecret(hmacKeyVersion)
  const valid = await verifyHmac(
    secret,
    SIGNATURE_DOMAIN + signingInput,
    signature,
  )
  if (!valid) throw new InvitationTokenError()

  const payload = decodePayload(segments[2], tokenVersion)
  const tokenHash = await signHmac(secret, STORAGE_HASH_DOMAIN + token)
  return { token, tokenHash, tokenVersion, hmacKeyVersion, payload }
}

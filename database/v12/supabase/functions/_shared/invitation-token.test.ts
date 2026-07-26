import { describe, expect, it } from "vitest"
import {
  decodeBase64Url,
  encodeBase64Url,
  InvitationTokenError,
  issueInvitationToken,
  verifyInvitationToken,
} from "./invitation-token.ts"

const secret = Uint8Array.from({ length: 32 }, (_, index) => index + 1)
const secondSecret = Uint8Array.from({ length: 32 }, (_, index) => 255 - index)
const invitationId = "91000000-0000-4000-8000-000000000001"
const issuedAt = new Date("2026-07-22T00:00:00.000Z")
const expiresAt = new Date("2026-07-23T00:00:00.000Z")
const nonceBytes = Uint8Array.from({ length: 32 }, (_, index) => index + 32)

async function signNonCanonicalPayload(signingInput: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`rotary-v12-invitation-signature\0${signingInput}`),
  )
  return encodeBase64Url(new Uint8Array(signature))
}

describe("Invitation HMAC token", () => {
  it("creates a versioned signed payload with a 32-byte CSPRNG nonce", async () => {
    const material = await issueInvitationToken({
      invitationId,
      issuedAt,
      expiresAt,
      secret,
      hmacKeyVersion: 1,
      nonceBytes,
    })

    expect(material.token.split(".")).toHaveLength(4)
    expect(material.token.startsWith("v1.k1.")).toBe(true)
    expect(decodeBase64Url(material.payload.nonce)).toHaveLength(32)
    expect(material.payload).toEqual({
      invitation_id: invitationId,
      issued_at: 1_784_678_400,
      expires_at: 1_784_764_800,
      nonce: material.payload.nonce,
      version: 1,
    })
  })

  it("verifies integrity and derives a separate 32-byte HMAC storage hash", async () => {
    const issued = await issueInvitationToken({
      invitationId,
      issuedAt,
      expiresAt,
      secret,
      hmacKeyVersion: 1,
      nonceBytes,
    })
    const verified = await verifyInvitationToken(issued.token, () => secret)
    const plainSha = new Uint8Array(await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(issued.token),
    ))

    expect(verified.payload).toEqual(issued.payload)
    expect(verified.tokenHash).toEqual(issued.tokenHash)
    expect(verified.tokenHash).toHaveLength(32)
    expect(verified.tokenHash).not.toEqual(plainSha)
  })

  it("rejects signature tampering with the fixed error code", async () => {
    const issued = await issueInvitationToken({
      invitationId,
      issuedAt,
      expiresAt,
      secret,
      hmacKeyVersion: 1,
      nonceBytes,
    })
    const tampered = issued.token.slice(0, -1) + (issued.token.endsWith("A") ? "B" : "A")
    await expect(verifyInvitationToken(tampered, () => secret))
      .rejects.toMatchObject({ code: "INVITATION_INVALID_SIGNATURE" })
  })

  it("rejects an incorrect HMAC secret", async () => {
    const issued = await issueInvitationToken({
      invitationId,
      issuedAt,
      expiresAt,
      secret,
      hmacKeyVersion: 1,
      nonceBytes,
    })
    await expect(verifyInvitationToken(issued.token, () => secondSecret))
      .rejects.toBeInstanceOf(InvitationTokenError)
  })

  it("rejects nonce material that is not exactly 32 bytes", async () => {
    await expect(issueInvitationToken({
      invitationId,
      issuedAt,
      expiresAt,
      secret,
      hmacKeyVersion: 1,
      nonceBytes: new Uint8Array(31),
    })).rejects.toMatchObject({ code: "INVITATION_INVALID_SIGNATURE" })
  })

  it("does not serialize the HMAC secret or a plaintext token field", async () => {
    const issued = await issueInvitationToken({
      invitationId,
      issuedAt,
      expiresAt,
      secret,
      hmacKeyVersion: 1,
      nonceBytes,
    })
    const payloadText = new TextDecoder().decode(
      decodeBase64Url(issued.token.split(".")[2]),
    )

    expect(payloadText).not.toContain("secret")
    expect(payloadText).not.toContain("token")
    expect(issued.token).not.toContain(Array.from(secret).join(","))
  })

  it("serializes the signed payload in one fixed canonical field order", async () => {
    const issued = await issueInvitationToken({
      invitationId,
      issuedAt,
      expiresAt,
      secret,
      hmacKeyVersion: 1,
      nonceBytes,
    })
    const payloadText = new TextDecoder().decode(
      decodeBase64Url(issued.token.split(".")[2]),
    )

    expect(payloadText).toBe(JSON.stringify({
      expires_at: 1_784_764_800,
      invitation_id: invitationId,
      issued_at: 1_784_678_400,
      nonce: issued.payload.nonce,
      version: 1,
    }))
  })

  it("rejects a valid HMAC over a non-canonical payload encoding", async () => {
    const nonce = encodeBase64Url(nonceBytes)
    const nonCanonicalPayload = encodeBase64Url(new TextEncoder().encode(JSON.stringify({
      invitation_id: invitationId,
      issued_at: 1_784_678_400,
      expires_at: 1_784_764_800,
      nonce,
      version: 1,
    })))
    const signingInput = `v1.k1.${nonCanonicalPayload}`
    const token = `${signingInput}.${await signNonCanonicalPayload(signingInput)}`

    await expect(verifyInvitationToken(token, () => secret))
      .rejects.toBeInstanceOf(InvitationTokenError)
  })

  it("rejects unknown token versions before secret resolution", async () => {
    let resolved = false
    await expect(verifyInvitationToken("v2.k1.payload.signature", () => {
      resolved = true
      return secret
    })).rejects.toBeInstanceOf(InvitationTokenError)
    expect(resolved).toBe(false)
  })

  it("rejects tokens longer than 4096 characters before secret resolution", async () => {
    let resolved = false
    await expect(verifyInvitationToken("x".repeat(4097), () => {
      resolved = true
      return secret
    })).rejects.toBeInstanceOf(InvitationTokenError)
    expect(resolved).toBe(false)
  })
})

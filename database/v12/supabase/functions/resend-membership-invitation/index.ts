import {
  callInvitationRpc,
  hashCanonicalRequest,
  invitationErrorResponse,
  jsonResponse,
  loadInvitationHmacIssuingKey,
  readJsonObject,
  requireAuthenticatedUser,
  requireExpirySeconds,
  requireIdempotencyKey,
  requireOnlyKeys,
  requireUuid,
  serveInvitationHandler,
  toPostgresBytea,
} from "../_shared/invitation-edge.ts"
import { INVITATION_TOKEN_VERSION, issueInvitationToken } from "../_shared/invitation-token.ts"

const invitationHmacKey = loadInvitationHmacIssuingKey()

serveInvitationHandler(async (request) => {
  const actorAuthUserId = await requireAuthenticatedUser(request)
  const input = await readJsonObject(request)
  requireOnlyKeys(input, ["invitation_id", "idempotency_key", "expires_in_seconds"])
  const invitationId = requireUuid(input.invitation_id)
  const idempotencyKey = requireIdempotencyKey(input.idempotency_key)
  const expiresInSeconds = requireExpirySeconds(input.expires_in_seconds)
  const issuedAt = new Date()
  const expiresAt = new Date(issuedAt.getTime() + expiresInSeconds * 1000)
  const material = await issueInvitationToken({
    invitationId,
    issuedAt,
    expiresAt,
    secret: invitationHmacKey.secret,
    hmacKeyVersion: invitationHmacKey.hmacKeyVersion,
  })
  const requestHash = await hashCanonicalRequest({
    operation: "invitation_resend",
    invitation_id: invitationId,
    delivery_channel: "manual_link",
    expires_in_seconds: expiresInSeconds,
    actor_auth_user_id: actorAuthUserId,
  })
  const result = await callInvitationRpc("resend_membership_invitation", {
    p_invitation_id: invitationId,
    p_token_hash: toPostgresBytea(material.tokenHash),
    p_token_version: INVITATION_TOKEN_VERSION,
    p_hmac_key_version: invitationHmacKey.hmacKeyVersion,
    p_token_nonce: material.payload.nonce,
    p_token_issued_at: new Date(material.payload.issued_at * 1000).toISOString(),
    p_expires_at: new Date(material.payload.expires_at * 1000).toISOString(),
    p_idempotency_key: idempotencyKey,
    p_request_hash: toPostgresBytea(requestHash),
    p_actor_auth_user_id: actorAuthUserId,
    p_request_id: crypto.randomUUID(),
  })

  if (result.invitation_error_code) {
    return invitationErrorResponse(result.invitation_error_code)
  }
  return jsonResponse({
    invitation_id: result.invitation_id,
    invitation_status: result.invitation_status,
    token: result.invitation_is_replay ? null : material.token,
    token_available: !result.invitation_is_replay,
    expires_at: result.invitation_is_replay
      ? null
      : new Date(material.payload.expires_at * 1000).toISOString(),
  })
})

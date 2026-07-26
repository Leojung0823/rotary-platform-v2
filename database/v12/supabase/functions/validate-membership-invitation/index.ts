import {
  assertInvitationHmacRuntimeConfiguration,
  callInvitationValidationRpc,
  hashCanonicalRequest,
  invitationValidationErrorResponse,
  isoTimestamp,
  jsonResponse,
  loadInvitationHmacSecret,
  readJsonObject,
  requireAuthenticatedUser,
  requireIdempotencyKey,
  requireOnlyKeys,
  serveInvitationHandler,
  toPostgresBytea,
} from "../_shared/invitation-edge.ts"
import { verifyInvitationToken } from "../_shared/invitation-token.ts"

assertInvitationHmacRuntimeConfiguration()

serveInvitationHandler(async (request) => {
  const actorAuthUserId = await requireAuthenticatedUser(request)
  const input = await readJsonObject(request)
  requireOnlyKeys(input, ["token", "idempotency_key"])
  if (typeof input.token !== "string") {
    return invitationValidationErrorResponse("INVITATION_INVALID_SIGNATURE")
  }
  const idempotencyKey = requireIdempotencyKey(input.idempotency_key)
  const material = await verifyInvitationToken(input.token, loadInvitationHmacSecret)
  const requestHash = await hashCanonicalRequest({
    operation: "invitation_validate",
    invitation_id: material.payload.invitation_id,
    actor_auth_user_id: actorAuthUserId,
    token_hash: toPostgresBytea(material.tokenHash),
    token_version: material.tokenVersion,
    hmac_key_version: material.hmacKeyVersion,
    token_issued_at: isoTimestamp(material.payload.issued_at),
    token_expires_at: isoTimestamp(material.payload.expires_at),
  })
  const result = await callInvitationValidationRpc({
    p_invitation_id: material.payload.invitation_id,
    p_token_hash: toPostgresBytea(material.tokenHash),
    p_token_version: material.tokenVersion,
    p_hmac_key_version: material.hmacKeyVersion,
    p_token_issued_at: isoTimestamp(material.payload.issued_at),
    p_token_expires_at: isoTimestamp(material.payload.expires_at),
    p_idempotency_key: idempotencyKey,
    p_request_hash: toPostgresBytea(requestHash),
    p_actor_auth_user_id: actorAuthUserId,
    p_request_id: crypto.randomUUID(),
  })

  if (result.invitation_error_code) {
    return invitationValidationErrorResponse(result.invitation_error_code)
  }
  return jsonResponse({
    invitation_id: result.invitation_id,
    is_valid: result.invitation_is_valid,
    can_attempt_onboarding: result.invitation_can_attempt_onboarding,
    validated_at: result.invitation_validated_at,
    is_idempotent_retry: result.invitation_is_idempotent_retry,
  })
})

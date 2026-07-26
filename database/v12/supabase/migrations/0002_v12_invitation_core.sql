BEGIN;
SET TIME ZONE 'UTC';
SET search_path = public, extensions, pg_catalog;

-- Invitation secrets and plaintext tokens remain outside PostgreSQL. The
-- database stores only the Edge-computed HMAC token hash and signed payload
-- metadata required for state, replay, and idempotency enforcement.

CREATE SCHEMA IF NOT EXISTS v12_invitation;
REVOKE ALL ON SCHEMA v12_invitation FROM PUBLIC, anon, authenticated;

ALTER TABLE public.invitations
  RENAME COLUMN invitation_token_digest TO invitation_token_hash;

ALTER TABLE public.invitations
  RENAME COLUMN invitation_token_hash_version TO invitation_hmac_key_version;

ALTER TABLE public.invitations
  RENAME CONSTRAINT uq_invitations__token_digest TO uq_invitations__token_hash;

ALTER TABLE public.invitations
  DROP CONSTRAINT ck_invitations__hash_version,
  DROP CONSTRAINT ck_invitations__accepted_state,
  ADD COLUMN invitation_token_version smallint NOT NULL,
  ADD COLUMN invitation_token_nonce text NOT NULL,
  ADD COLUMN invitation_token_issued_at timestamptz NOT NULL,
  ADD COLUMN invitation_consumed_at timestamptz,
  ADD COLUMN invitation_accepted_by_auth_user_id uuid,
  ADD CONSTRAINT ck_invitations__hmac_key_version CHECK (
    invitation_hmac_key_version > 0
  ),
  ADD CONSTRAINT ck_invitations__token_version CHECK (
    invitation_token_version = 1
  ),
  ADD CONSTRAINT ck_invitations__token_hash CHECK (
    octet_length(invitation_token_hash) = 32
  ),
  ADD CONSTRAINT ck_invitations__token_nonce CHECK (
    invitation_token_nonce ~ '^[A-Za-z0-9_-]{43}$'
  ),
  ADD CONSTRAINT ck_invitations__token_time CHECK (
    invitation_token_issued_at <= invitation_created_at + interval '5 minutes'
    AND invitation_expires_at > invitation_token_issued_at
  ),
  ADD CONSTRAINT ck_invitations__accepted_state CHECK (
    (
      invitation_status = 'accepted'
      AND invitation_accepted_at IS NOT NULL
      AND invitation_accepted_by_auth_user_id IS NOT NULL
      AND invitation_consumed_at IS NOT NULL
      AND invitation_revoked_at IS NULL
      AND invitation_marked_expired_at IS NULL
    )
    OR
    (
      invitation_status <> 'accepted'
      AND invitation_accepted_at IS NULL
      AND invitation_accepted_by_account_id IS NULL
      AND invitation_accepted_by_auth_user_id IS NULL
      AND invitation_consumed_at IS NULL
    )
  ),
  ADD CONSTRAINT ck_invitations__acceptance_time CHECK (
    invitation_status <> 'accepted'
    OR (
      invitation_accepted_at >= invitation_token_issued_at
      AND invitation_consumed_at >= invitation_accepted_at
    )
  );

CREATE UNIQUE INDEX uq_invitations__token_nonce
  ON public.invitations (invitation_token_nonce);

COMMENT ON COLUMN public.invitations.invitation_token_hash IS 'Domain-separated HMAC-SHA-256 hash calculated by the trusted Edge boundary over the complete invitation token. PostgreSQL never receives plaintext tokens or HMAC secrets.';
COMMENT ON COLUMN public.invitations.invitation_hmac_key_version IS 'Supabase Secret key version used by the trusted Edge boundary. The secret value is never stored in PostgreSQL.';
COMMENT ON COLUMN public.invitations.invitation_token_version IS 'Version of the signed invitation token envelope and payload contract.';
COMMENT ON COLUMN public.invitations.invitation_token_nonce IS 'Unique 32-byte CSPRNG nonce encoded as unpadded Base64url and carried inside the signed payload.';
COMMENT ON COLUMN public.invitations.invitation_token_issued_at IS 'Issued-at timestamp copied from the HMAC-verified token payload.';
COMMENT ON COLUMN public.invitations.invitation_accepted_at IS 'Reserved for PR-03: timestamp committed only by the same transaction that completes onboarding and consumes the invitation.';
COMMENT ON COLUMN public.invitations.invitation_accepted_by_account_id IS 'Reserved for PR-03: Account bound by the atomic onboarding transaction when an Account exists.';
COMMENT ON COLUMN public.invitations.invitation_consumed_at IS 'Reserved for PR-03: token consumption time committed atomically with onboarding and accepted state. PR-02 validation never writes this field.';
COMMENT ON COLUMN public.invitations.invitation_accepted_by_auth_user_id IS 'Reserved for PR-03: verified Supabase Auth UUID bound by the atomic onboarding transaction. PR-02 validation never writes this field.';

ALTER TABLE public.invitation_events
  DROP CONSTRAINT ck_invitation_events__type,
  ADD COLUMN invitation_event_actor_auth_user_id uuid,
  ADD CONSTRAINT ck_invitation_events__type CHECK (
    invitation_event_type IN (
      'created', 'delivery_handoff', 'validated', 'accepted', 'revoked',
      'expired', 'validation_failed', 'replay_attempt'
    )
  ),
  ADD CONSTRAINT ck_invitation_events__reason_code CHECK (
    invitation_event_reason_code IS NULL
    OR invitation_event_reason_code IN (
      'issued', 'reissued', 'operator_revoked', 'duplicate_invitation',
      'membership_ineligible', 'security_response',
      'INVITATION_NOT_FOUND', 'INVITATION_EXPIRED',
      'INVITATION_REVOKED', 'INVITATION_ALREADY_ACCEPTED',
      'INVITATION_INVALID_SIGNATURE', 'INVITATION_REPLAY',
      'INVITATION_IDEMPOTENCY_CONFLICT'
    )
  );

COMMENT ON COLUMN public.invitation_events.invitation_event_type IS 'Invitation lifecycle event. PR-02 delivery_handoff means a plaintext token was returned once to an authorized manager for manual out-of-band delivery; it does not prove provider delivery, invitee receipt, or acceptance.';
COMMENT ON COLUMN public.invitation_events.invitation_event_actor_auth_user_id IS 'Verified Supabase Auth UUID that initiated the request. This weak reference records the authenticated Auth User and does not prove Invitation ownership, Account binding, Person binding, or onboarding.';
COMMENT ON COLUMN public.invitation_events.invitation_event_reason_code IS 'Allowlisted lifecycle or stable application reason. issued/reissued qualify a manual delivery_handoff and do not assert delivery to an invitee.';

ALTER TABLE public.invitations
  ADD CONSTRAINT ck_invitations__revoke_reason CHECK (
    invitation_revoke_reason IS NULL
    OR invitation_revoke_reason IN (
      'operator_revoked', 'duplicate_invitation',
      'membership_ineligible', 'security_response'
    )
  );

ALTER TABLE public.idempotency_records
  DROP CONSTRAINT ck_idempotency_records__completion,
  ADD COLUMN idempotency_error_code text,
  ADD CONSTRAINT ck_idempotency_records__error_code CHECK (
    idempotency_error_code IS NULL OR idempotency_error_code IN (
      'INVITATION_NOT_FOUND',
      'INVITATION_EXPIRED',
      'INVITATION_REVOKED',
      'INVITATION_ALREADY_ACCEPTED',
      'INVITATION_INVALID_SIGNATURE',
      'INVITATION_REPLAY',
      'INVITATION_IDEMPOTENCY_CONFLICT'
    )
  ),
  ADD CONSTRAINT ck_idempotency_records__completion CHECK (
    (
      idempotency_status = 'pending'
      AND idempotency_completed_at IS NULL
      AND idempotency_error_code IS NULL
    )
    OR
    (
      idempotency_status = 'completed'
      AND idempotency_completed_at IS NOT NULL
      AND idempotency_error_code IS NULL
    )
    OR
    (
      idempotency_status = 'failed'
      AND idempotency_completed_at IS NOT NULL
      AND idempotency_error_code IS NOT NULL
    )
  );

COMMENT ON COLUMN public.idempotency_records.idempotency_error_code IS 'Allowlisted stable Invitation application error returned by an idempotent failed operation; never contains raw PostgreSQL or provider text. INVITATION_REPLAY is reserved for the future PR-03 final onboarding transaction and is never produced by PR-02 validation.';
COMMENT ON COLUMN public.idempotency_records.idempotency_operation_type IS 'Operation type such as invitation_create, invitation_resend, invitation_validate, invitation_revoke, or a later domain transaction.';
COMMENT ON COLUMN public.idempotency_records.idempotency_actor_auth_user_id IS 'Verified external Auth user UUID used only to scope retry/idempotency for pre-Account operations such as PR-02 validation; weak reference with no FK and never evidence of invitation ownership or final Auth binding.';
COMMENT ON COLUMN public.idempotency_records.idempotency_request_hash IS 'Hash of a canonical non-secret request. Invitation Validate fingerprints operation, Invitation ID, verified actor UUID, HMAC-derived storage hash, token/key versions, and issued/expiry metadata. Live status and DB time are revalidated on every retry instead of being frozen into this hash. Plaintext tokens, signatures, nonces, secrets, Authorization, and destination are forbidden.';

CREATE OR REPLACE FUNCTION v12_invitation.actor_can_manage_membership(
  p_actor_auth_user_id uuid,
  p_membership_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_actor_account_id uuid;
  v_club_id uuid;
  v_district_id uuid;
BEGIN
  SELECT
    actor.account_id,
    membership.membership_club_id,
    club.club_district_id
  INTO v_actor_account_id, v_club_id, v_district_id
  FROM public.accounts AS actor
  CROSS JOIN public.memberships AS membership
  JOIN public.clubs AS club
    ON club.club_id = membership.membership_club_id
  WHERE actor.account_auth_user_id = p_actor_auth_user_id
    AND actor.account_kind = 'human'
    AND actor.account_status = 'active'
    AND membership.membership_id = p_membership_id;

  IF v_actor_account_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.platform_role_assignments AS assignment
    JOIN public.roles AS role
      ON role.role_id = assignment.platform_role_assignment_role_id
    JOIN public.role_permissions AS role_permission
      ON role_permission.role_permission_role_id = role.role_id
    JOIN public.permissions AS permission
      ON permission.permission_id = role_permission.role_permission_permission_id
    WHERE assignment.platform_role_assignment_account_id = v_actor_account_id
      AND assignment.platform_role_assignment_status = 'active'
      AND assignment.platform_role_assignment_starts_at <= now()
      AND (
        assignment.platform_role_assignment_ends_at IS NULL
        OR assignment.platform_role_assignment_ends_at > now()
      )
      AND role.role_status = 'active'
      AND permission.permission_status = 'active'
      AND permission.permission_code = 'invitation.manage'
  ) OR EXISTS (
    SELECT 1
    FROM public.district_role_assignments AS assignment
    JOIN public.roles AS role
      ON role.role_id = assignment.district_role_assignment_role_id
    JOIN public.role_permissions AS role_permission
      ON role_permission.role_permission_role_id = role.role_id
    JOIN public.permissions AS permission
      ON permission.permission_id = role_permission.role_permission_permission_id
    WHERE assignment.district_role_assignment_account_id = v_actor_account_id
      AND assignment.district_role_assignment_district_id = v_district_id
      AND assignment.district_role_assignment_status = 'active'
      AND assignment.district_role_assignment_starts_at <= now()
      AND (
        assignment.district_role_assignment_ends_at IS NULL
        OR assignment.district_role_assignment_ends_at > now()
      )
      AND role.role_status = 'active'
      AND permission.permission_status = 'active'
      AND permission.permission_code = 'invitation.manage'
  ) OR EXISTS (
    SELECT 1
    FROM public.membership_role_assignments AS assignment
    JOIN public.memberships AS actor_membership
      ON actor_membership.membership_id = assignment.membership_role_assignment_membership_id
    JOIN public.roles AS role
      ON role.role_id = assignment.membership_role_assignment_role_id
    JOIN public.role_permissions AS role_permission
      ON role_permission.role_permission_role_id = role.role_id
    JOIN public.permissions AS permission
      ON permission.permission_id = role_permission.role_permission_permission_id
    WHERE actor_membership.membership_person_id = (
        SELECT account_person_id
        FROM public.accounts
        WHERE account_id = v_actor_account_id
      )
      AND actor_membership.membership_club_id = v_club_id
      AND actor_membership.membership_status = 'active'
      AND assignment.membership_role_assignment_status = 'active'
      AND assignment.membership_role_assignment_starts_at <= now()
      AND (
        assignment.membership_role_assignment_ends_at IS NULL
        OR assignment.membership_role_assignment_ends_at > now()
      )
      AND role.role_status = 'active'
      AND permission.permission_status = 'active'
      AND permission.permission_code = 'invitation.manage'
  ) THEN
    RETURN v_actor_account_id;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION v12_invitation.actor_can_manage_membership(uuid, uuid) IS 'Resolves an active Account from a trusted Auth UUID and verifies current platform, district, or same-club invitation.manage authority.';

CREATE OR REPLACE FUNCTION v12_invitation.write_event(
  p_invitation_id uuid,
  p_event_type text,
  p_actor_account_id uuid,
  p_actor_auth_user_id uuid,
  p_result text,
  p_reason_code text,
  p_request_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_audit_result text;
BEGIN
  INSERT INTO public.invitation_events (
    invitation_event_invitation_id,
    invitation_event_type,
    invitation_event_actor_account_id,
    invitation_event_actor_auth_user_id,
    invitation_event_result,
    invitation_event_reason_code,
    invitation_event_request_id
  )
  VALUES (
    p_invitation_id,
    p_event_type,
    p_actor_account_id,
    p_actor_auth_user_id,
    p_result,
    p_reason_code,
    p_request_id
  );

  v_audit_result := CASE
    WHEN p_result = 'success' THEN 'success'
    WHEN p_result = 'blocked' THEN 'denied'
    ELSE 'failure'
  END;

  INSERT INTO public.audit_logs (
    audit_log_actor_account_id,
    audit_log_action_code,
    audit_log_target_type,
    audit_log_target_id,
    audit_log_district_id,
    audit_log_club_id,
    audit_log_result,
    audit_log_failure_reason,
    audit_log_request_id,
    audit_log_data_classification
  )
  SELECT
    p_actor_account_id,
    'invitation.' || p_event_type,
    'invitation',
    invitation.invitation_id,
    club.club_district_id,
    membership.membership_club_id,
    v_audit_result,
    CASE WHEN v_audit_result = 'success' THEN NULL ELSE p_reason_code END,
    p_request_id,
    'internal'
  FROM public.invitations AS invitation
  JOIN public.memberships AS membership
    ON membership.membership_id = invitation.invitation_membership_id
  JOIN public.clubs AS club
    ON club.club_id = membership.membership_club_id
  WHERE invitation.invitation_id = p_invitation_id;
END;
$$;

COMMENT ON FUNCTION v12_invitation.write_event(uuid, text, uuid, uuid, text, text, uuid) IS 'Writes the verified Auth User to the Invitation event and a trusted Account mapping to the existing audit skeleton when available; token, Authorization, hash, nonce, HMAC key, destination, and secret values are excluded.';

CREATE OR REPLACE FUNCTION v12_invitation.finish_idempotency(
  p_record_id uuid,
  p_result_reference uuid,
  p_error_code text
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  UPDATE public.idempotency_records
  SET
    idempotency_status = CASE
      WHEN p_error_code IS NULL THEN 'completed'
      ELSE 'failed'
    END,
    idempotency_result_type = CASE
      WHEN p_error_code IS NULL THEN 'invitation'
      ELSE 'invitation_error'
    END,
    idempotency_result_reference = p_result_reference,
    idempotency_completed_at = clock_timestamp(),
    idempotency_error_code = p_error_code
  WHERE idempotency_record_id = p_record_id
$$;

COMMENT ON FUNCTION v12_invitation.finish_idempotency(uuid, uuid, text) IS 'Completes an Invitation idempotency record with either a result reference or an allowlisted stable error code.';

CREATE OR REPLACE FUNCTION v12_invitation.validate_token_snapshot(
  p_invitation_id uuid,
  p_token_hash bytea,
  p_token_version smallint,
  p_hmac_key_version smallint,
  p_token_issued_at timestamptz,
  p_token_expires_at timestamptz
)
RETURNS TABLE (
  invitation_id uuid,
  membership_id uuid,
  invitation_status text,
  invitation_expires_at timestamptz,
  invitation_error_code text
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_invitation public.invitations%ROWTYPE;
BEGIN
  SELECT invitation.*
  INTO v_invitation
  FROM public.invitations AS invitation
  WHERE invitation.invitation_id = p_invitation_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      p_invitation_id, NULL::uuid, NULL::text, NULL::timestamptz,
      'INVITATION_NOT_FOUND'::text;
    RETURN;
  END IF;

  IF v_invitation.invitation_token_hash IS DISTINCT FROM p_token_hash
    OR v_invitation.invitation_token_version IS DISTINCT FROM p_token_version
    OR v_invitation.invitation_hmac_key_version IS DISTINCT FROM p_hmac_key_version
    OR v_invitation.invitation_token_issued_at IS DISTINCT FROM p_token_issued_at
    OR v_invitation.invitation_expires_at IS DISTINCT FROM p_token_expires_at
  THEN
    RETURN QUERY SELECT
      v_invitation.invitation_id,
      v_invitation.invitation_membership_id,
      v_invitation.invitation_status,
      v_invitation.invitation_expires_at,
      'INVITATION_INVALID_SIGNATURE'::text;
    RETURN;
  END IF;

  IF v_invitation.invitation_status = 'accepted' THEN
    RETURN QUERY SELECT
      v_invitation.invitation_id,
      v_invitation.invitation_membership_id,
      v_invitation.invitation_status,
      v_invitation.invitation_expires_at,
      'INVITATION_ALREADY_ACCEPTED'::text;
    RETURN;
  ELSIF v_invitation.invitation_status = 'revoked' THEN
    RETURN QUERY SELECT
      v_invitation.invitation_id,
      v_invitation.invitation_membership_id,
      v_invitation.invitation_status,
      v_invitation.invitation_expires_at,
      'INVITATION_REVOKED'::text;
    RETURN;
  ELSIF v_invitation.invitation_status = 'expired'
    OR v_invitation.invitation_expires_at <= clock_timestamp()
  THEN
    RETURN QUERY SELECT
      v_invitation.invitation_id,
      v_invitation.invitation_membership_id,
      'expired'::text,
      v_invitation.invitation_expires_at,
      'INVITATION_EXPIRED'::text;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.memberships AS membership
    WHERE membership.membership_id = v_invitation.invitation_membership_id
      AND membership.membership_status = 'pending'
  ) THEN
    RETURN QUERY SELECT
      v_invitation.invitation_id,
      v_invitation.invitation_membership_id,
      v_invitation.invitation_status,
      v_invitation.invitation_expires_at,
      'INVITATION_NOT_FOUND'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    v_invitation.invitation_id,
    v_invitation.invitation_membership_id,
    v_invitation.invitation_status,
    v_invitation.invitation_expires_at,
    NULL::text;
END;
$$;

COMMENT ON FUNCTION v12_invitation.validate_token_snapshot(uuid, bytea, smallint, smallint, timestamptz, timestamptz) IS 'Private read-only PR-02 token snapshot validation. It never reserves or consumes an Invitation. A future PR-03 onboarding transaction must re-lock Invitation then Membership then Account, revalidate this material in that same transaction, bind the verified Auth user fail-closed, and only then commit accepted/consumed state.';

CREATE OR REPLACE FUNCTION public.create_membership_invitation(
  p_invitation_id uuid,
  p_membership_id uuid,
  p_token_hash bytea,
  p_token_version smallint,
  p_hmac_key_version smallint,
  p_token_nonce text,
  p_token_issued_at timestamptz,
  p_expires_at timestamptz,
  p_delivery_channel text,
  p_destination_masked text,
  p_idempotency_key text,
  p_request_hash bytea,
  p_actor_auth_user_id uuid,
  p_request_id uuid
)
RETURNS TABLE (
  invitation_id uuid,
  invitation_status text,
  invitation_error_code text,
  invitation_is_replay boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing_invitation_id uuid;
  v_actor_account_id uuid;
  v_idempotency public.idempotency_records%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NULL
    OR p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,128}$'
    OR octet_length(p_request_hash) IS DISTINCT FROM 32
  THEN
    RETURN QUERY SELECT p_invitation_id, NULL::text,
      'INVITATION_IDEMPOTENCY_CONFLICT', false;
    RETURN;
  END IF;

  IF p_invitation_id IS NULL
    OR p_membership_id IS NULL
    OR p_actor_auth_user_id IS NULL
    OR octet_length(p_token_hash) IS DISTINCT FROM 32
    OR p_token_version IS DISTINCT FROM 1
    OR p_hmac_key_version IS NULL
    OR p_hmac_key_version <= 0
    OR p_token_nonce IS NULL
    OR p_token_nonce !~ '^[A-Za-z0-9_-]{43}$'
    OR p_token_issued_at IS NULL
    OR p_expires_at IS NULL
    OR p_expires_at <= p_token_issued_at
    OR p_expires_at > p_token_issued_at + interval '7 days'
    OR p_token_issued_at > clock_timestamp() + interval '5 minutes'
    OR p_delivery_channel IS DISTINCT FROM 'manual_link'
    OR p_destination_masked IS NOT NULL
  THEN
    RETURN QUERY SELECT p_invitation_id, NULL::text, 'INVITATION_INVALID_SIGNATURE', false;
    RETURN;
  END IF;

  -- Lock order: existing Invitation (when present) -> Membership -> Account.
  SELECT candidate.invitation_id
  INTO v_existing_invitation_id
  FROM public.invitations AS candidate
  WHERE candidate.invitation_membership_id = p_membership_id
    AND candidate.invitation_status = 'pending'
  FOR UPDATE;

  PERFORM 1
  FROM public.memberships AS membership
  WHERE membership.membership_id = p_membership_id
    AND membership.membership_status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT p_invitation_id, NULL::text, 'INVITATION_NOT_FOUND', false;
    RETURN;
  END IF;

  v_actor_account_id := v12_invitation.actor_can_manage_membership(
    p_actor_auth_user_id,
    p_membership_id
  );
  IF v_actor_account_id IS NULL THEN
    RETURN QUERY SELECT p_invitation_id, NULL::text, 'INVITATION_NOT_FOUND', false;
    RETURN;
  END IF;

  PERFORM 1
  FROM public.accounts AS actor
  WHERE actor.account_id = v_actor_account_id
    AND actor.account_auth_user_id = p_actor_auth_user_id
    AND actor.account_status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT p_invitation_id, NULL::text, 'INVITATION_NOT_FOUND', false;
    RETURN;
  END IF;

  INSERT INTO public.idempotency_records (
    idempotency_key,
    idempotency_operation_type,
    idempotency_actor_account_id,
    idempotency_request_hash,
    idempotency_expires_at
  )
  VALUES (
    p_idempotency_key,
    'invitation_create',
    v_actor_account_id,
    p_request_hash,
    greatest(p_expires_at + interval '1 day', now() + interval '1 day')
  )
  ON CONFLICT DO NOTHING;

  SELECT record.*
  INTO v_idempotency
  FROM public.idempotency_records AS record
  WHERE record.idempotency_operation_type = 'invitation_create'
    AND record.idempotency_actor_account_id = v_actor_account_id
    AND record.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF v_idempotency.idempotency_request_hash IS DISTINCT FROM p_request_hash THEN
    RETURN QUERY SELECT v_idempotency.idempotency_result_reference, NULL::text,
      'INVITATION_IDEMPOTENCY_CONFLICT', true;
    RETURN;
  END IF;
  IF v_idempotency.idempotency_status IN ('completed', 'failed') THEN
    RETURN QUERY
    SELECT
      v_idempotency.idempotency_result_reference,
      CASE WHEN v_idempotency.idempotency_error_code IS NULL THEN 'pending' ELSE NULL END,
      v_idempotency.idempotency_error_code,
      true;
    RETURN;
  END IF;

  -- Recheck after the Membership lock serializes concurrent creates.
  IF v_existing_invitation_id IS NULL THEN
    SELECT candidate.invitation_id
    INTO v_existing_invitation_id
    FROM public.invitations AS candidate
    WHERE candidate.invitation_membership_id = p_membership_id
      AND candidate.invitation_status = 'pending';
  END IF;
  IF v_existing_invitation_id IS NOT NULL THEN
    PERFORM v12_invitation.finish_idempotency(
      v_idempotency.idempotency_record_id,
      v_existing_invitation_id,
      'INVITATION_IDEMPOTENCY_CONFLICT'
    );
    RETURN QUERY SELECT v_existing_invitation_id, 'pending',
      'INVITATION_IDEMPOTENCY_CONFLICT', false;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.invitations (
      invitation_id,
      invitation_membership_id,
      invitation_token_hash,
      invitation_hmac_key_version,
      invitation_token_version,
      invitation_token_nonce,
      invitation_token_issued_at,
      invitation_delivery_channel,
      invitation_destination_masked,
      invitation_expires_at,
      invitation_created_by_account_id
    )
    VALUES (
      p_invitation_id,
      p_membership_id,
      p_token_hash,
      p_hmac_key_version,
      p_token_version,
      p_token_nonce,
      p_token_issued_at,
      p_delivery_channel,
      p_destination_masked,
      p_expires_at,
      v_actor_account_id
    );
  EXCEPTION WHEN unique_violation THEN
    PERFORM v12_invitation.finish_idempotency(
      v_idempotency.idempotency_record_id,
      NULL,
      'INVITATION_INVALID_SIGNATURE'
    );
    RETURN QUERY SELECT p_invitation_id, NULL::text,
      'INVITATION_INVALID_SIGNATURE', false;
    RETURN;
  END;

  PERFORM v12_invitation.write_event(
    p_invitation_id, 'created', v_actor_account_id, p_actor_auth_user_id,
    'success', NULL, p_request_id
  );
  PERFORM v12_invitation.write_event(
    p_invitation_id, 'delivery_handoff', v_actor_account_id, p_actor_auth_user_id,
    'success', 'issued', p_request_id
  );
  PERFORM v12_invitation.finish_idempotency(
    v_idempotency.idempotency_record_id,
    p_invitation_id,
    NULL
  );

  RETURN QUERY SELECT p_invitation_id, 'pending', NULL::text, false;
END;
$$;

CREATE OR REPLACE FUNCTION public.resend_membership_invitation(
  p_invitation_id uuid,
  p_token_hash bytea,
  p_token_version smallint,
  p_hmac_key_version smallint,
  p_token_nonce text,
  p_token_issued_at timestamptz,
  p_expires_at timestamptz,
  p_idempotency_key text,
  p_request_hash bytea,
  p_actor_auth_user_id uuid,
  p_request_id uuid
)
RETURNS TABLE (
  invitation_id uuid,
  invitation_status text,
  invitation_error_code text,
  invitation_is_replay boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invitation public.invitations%ROWTYPE;
  v_actor_account_id uuid;
  v_idempotency public.idempotency_records%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NULL
    OR p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,128}$'
    OR octet_length(p_request_hash) IS DISTINCT FROM 32
  THEN
    RETURN QUERY SELECT p_invitation_id, NULL::text,
      'INVITATION_IDEMPOTENCY_CONFLICT', false;
    RETURN;
  END IF;

  IF p_invitation_id IS NULL OR p_actor_auth_user_id IS NULL THEN
    RETURN QUERY SELECT p_invitation_id, NULL::text,
      'INVITATION_INVALID_SIGNATURE', false;
    RETURN;
  END IF;

  SELECT invitation.*
  INTO v_invitation
  FROM public.invitations AS invitation
  WHERE invitation.invitation_id = p_invitation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT p_invitation_id, NULL::text, 'INVITATION_NOT_FOUND', false;
    RETURN;
  END IF;

  PERFORM 1
  FROM public.memberships AS membership
  WHERE membership.membership_id = v_invitation.invitation_membership_id
  FOR UPDATE;

  v_actor_account_id := v12_invitation.actor_can_manage_membership(
    p_actor_auth_user_id,
    v_invitation.invitation_membership_id
  );
  IF v_actor_account_id IS NULL THEN
    RETURN QUERY SELECT p_invitation_id, NULL::text, 'INVITATION_NOT_FOUND', false;
    RETURN;
  END IF;

  PERFORM 1
  FROM public.accounts AS actor
  WHERE actor.account_id = v_actor_account_id
    AND actor.account_auth_user_id = p_actor_auth_user_id
    AND actor.account_status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT p_invitation_id, NULL::text, 'INVITATION_NOT_FOUND', false;
    RETURN;
  END IF;

  INSERT INTO public.idempotency_records (
    idempotency_key,
    idempotency_operation_type,
    idempotency_actor_account_id,
    idempotency_request_hash,
    idempotency_expires_at
  )
  VALUES (
    p_idempotency_key,
    'invitation_resend',
    v_actor_account_id,
    p_request_hash,
    greatest(p_expires_at + interval '1 day', now() + interval '1 day')
  )
  ON CONFLICT DO NOTHING;

  SELECT record.*
  INTO v_idempotency
  FROM public.idempotency_records AS record
  WHERE record.idempotency_operation_type = 'invitation_resend'
    AND record.idempotency_actor_account_id = v_actor_account_id
    AND record.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF v_idempotency.idempotency_request_hash IS DISTINCT FROM p_request_hash THEN
    RETURN QUERY SELECT v_idempotency.idempotency_result_reference, NULL::text,
      'INVITATION_IDEMPOTENCY_CONFLICT', true;
    RETURN;
  END IF;
  IF v_idempotency.idempotency_status IN ('completed', 'failed') THEN
    RETURN QUERY
    SELECT
      v_idempotency.idempotency_result_reference,
      CASE WHEN v_idempotency.idempotency_error_code IS NULL THEN 'pending' ELSE NULL END,
      v_idempotency.idempotency_error_code,
      true;
    RETURN;
  END IF;

  IF octet_length(p_token_hash) IS DISTINCT FROM 32
    OR p_token_version IS DISTINCT FROM 1
    OR p_hmac_key_version IS NULL
    OR p_hmac_key_version <= 0
    OR p_token_nonce IS NULL
    OR p_token_nonce !~ '^[A-Za-z0-9_-]{43}$'
    OR p_token_issued_at IS NULL
    OR p_expires_at IS NULL
    OR p_expires_at <= p_token_issued_at
    OR p_expires_at > p_token_issued_at + interval '7 days'
    OR p_token_issued_at > clock_timestamp() + interval '5 minutes'
  THEN
    PERFORM v12_invitation.write_event(
      p_invitation_id, 'validation_failed', v_actor_account_id, p_actor_auth_user_id,
      'blocked', 'INVITATION_INVALID_SIGNATURE', p_request_id
    );
    PERFORM v12_invitation.finish_idempotency(
      v_idempotency.idempotency_record_id, p_invitation_id,
      'INVITATION_INVALID_SIGNATURE'
    );
    RETURN QUERY SELECT p_invitation_id, v_invitation.invitation_status,
      'INVITATION_INVALID_SIGNATURE', false;
    RETURN;
  END IF;

  IF v_invitation.invitation_status = 'accepted' THEN
    PERFORM v12_invitation.write_event(
      p_invitation_id, 'validation_failed', v_actor_account_id, p_actor_auth_user_id,
      'blocked', 'INVITATION_ALREADY_ACCEPTED', p_request_id
    );
    PERFORM v12_invitation.finish_idempotency(
      v_idempotency.idempotency_record_id, p_invitation_id,
      'INVITATION_ALREADY_ACCEPTED'
    );
    RETURN QUERY SELECT p_invitation_id, 'accepted',
      'INVITATION_ALREADY_ACCEPTED', false;
    RETURN;
  ELSIF v_invitation.invitation_status = 'revoked' THEN
    PERFORM v12_invitation.write_event(
      p_invitation_id, 'validation_failed', v_actor_account_id, p_actor_auth_user_id,
      'blocked', 'INVITATION_REVOKED', p_request_id
    );
    PERFORM v12_invitation.finish_idempotency(
      v_idempotency.idempotency_record_id, p_invitation_id,
      'INVITATION_REVOKED'
    );
    RETURN QUERY SELECT p_invitation_id, 'revoked', 'INVITATION_REVOKED', false;
    RETURN;
  ELSIF v_invitation.invitation_status = 'expired'
    OR v_invitation.invitation_expires_at <= clock_timestamp()
  THEN
    IF v_invitation.invitation_status = 'pending' THEN
      UPDATE public.invitations
      SET
        invitation_status = 'expired',
        invitation_marked_expired_at = clock_timestamp()
      WHERE invitations.invitation_id = p_invitation_id;
      PERFORM v12_invitation.write_event(
        p_invitation_id, 'expired', v_actor_account_id, p_actor_auth_user_id,
        'success', 'INVITATION_EXPIRED', p_request_id
      );
    END IF;
    PERFORM v12_invitation.finish_idempotency(
      v_idempotency.idempotency_record_id, p_invitation_id,
      'INVITATION_EXPIRED'
    );
    RETURN QUERY SELECT p_invitation_id, 'expired', 'INVITATION_EXPIRED', false;
    RETURN;
  END IF;

  BEGIN
    UPDATE public.invitations
    SET
      invitation_token_hash = p_token_hash,
      invitation_hmac_key_version = p_hmac_key_version,
      invitation_token_version = p_token_version,
      invitation_token_nonce = p_token_nonce,
      invitation_token_issued_at = p_token_issued_at,
      invitation_expires_at = p_expires_at
    WHERE invitations.invitation_id = p_invitation_id;
  EXCEPTION WHEN unique_violation THEN
    PERFORM v12_invitation.finish_idempotency(
      v_idempotency.idempotency_record_id, p_invitation_id,
      'INVITATION_INVALID_SIGNATURE'
    );
    RETURN QUERY SELECT p_invitation_id, 'pending',
      'INVITATION_INVALID_SIGNATURE', false;
    RETURN;
  END;

  PERFORM v12_invitation.write_event(
    p_invitation_id, 'delivery_handoff', v_actor_account_id, p_actor_auth_user_id,
    'success', 'reissued', p_request_id
  );
  PERFORM v12_invitation.finish_idempotency(
    v_idempotency.idempotency_record_id,
    p_invitation_id,
    NULL
  );

  RETURN QUERY SELECT p_invitation_id, 'pending', NULL::text, false;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_membership_invitation(
  p_invitation_id uuid,
  p_token_hash bytea,
  p_token_version smallint,
  p_hmac_key_version smallint,
  p_token_issued_at timestamptz,
  p_token_expires_at timestamptz,
  p_idempotency_key text,
  p_request_hash bytea,
  p_actor_auth_user_id uuid,
  p_request_id uuid
)
RETURNS TABLE (
  invitation_id uuid,
  invitation_error_code text,
  invitation_is_idempotent_retry boolean,
  invitation_is_valid boolean,
  invitation_can_attempt_onboarding boolean,
  invitation_validated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_validation record;
  v_actor_account_id uuid;
  v_idempotency public.idempotency_records%ROWTYPE;
  v_validated_at timestamptz;
BEGIN
  IF p_idempotency_key IS NULL
    OR p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,128}$'
    OR octet_length(p_request_hash) IS DISTINCT FROM 32
  THEN
    RETURN QUERY SELECT p_invitation_id,
      'INVITATION_IDEMPOTENCY_CONFLICT', false, false, false, NULL::timestamptz;
    RETURN;
  END IF;

  IF p_invitation_id IS NULL
    OR p_actor_auth_user_id IS NULL
    OR octet_length(p_token_hash) IS DISTINCT FROM 32
    OR p_token_version IS DISTINCT FROM 1
    OR p_hmac_key_version IS NULL
    OR p_hmac_key_version <= 0
    OR p_token_issued_at IS NULL
    OR p_token_expires_at IS NULL
    OR p_token_expires_at <= p_token_issued_at
    OR p_token_expires_at > p_token_issued_at + interval '7 days'
    OR p_token_issued_at > clock_timestamp() + interval '5 minutes'
  THEN
    RETURN QUERY SELECT p_invitation_id,
      'INVITATION_INVALID_SIGNATURE', false, false, false, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT validation.*
  INTO v_validation
  FROM v12_invitation.validate_token_snapshot(
    p_invitation_id,
    p_token_hash,
    p_token_version,
    p_hmac_key_version,
    p_token_issued_at,
    p_token_expires_at
  ) AS validation;

  IF v_validation.membership_id IS NULL THEN
    RETURN QUERY SELECT p_invitation_id, v_validation.invitation_error_code,
      false, false, false, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT actor.account_id
  INTO v_actor_account_id
  FROM public.accounts AS actor
  WHERE actor.account_auth_user_id = p_actor_auth_user_id
    AND actor.account_kind = 'human'
    AND actor.account_status = 'active';

  INSERT INTO public.idempotency_records (
    idempotency_key,
    idempotency_operation_type,
    idempotency_actor_account_id,
    idempotency_actor_auth_user_id,
    idempotency_request_hash,
    idempotency_expires_at
  )
  VALUES (
    p_idempotency_key,
    'invitation_validate',
    v_actor_account_id,
    p_actor_auth_user_id,
    p_request_hash,
    greatest(v_validation.invitation_expires_at + interval '1 day', now() + interval '1 day')
  )
  ON CONFLICT DO NOTHING;

  SELECT record.*
  INTO v_idempotency
  FROM public.idempotency_records AS record
  WHERE record.idempotency_operation_type = 'invitation_validate'
    AND record.idempotency_actor_auth_user_id = p_actor_auth_user_id
    AND record.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF v_idempotency.idempotency_request_hash IS DISTINCT FROM p_request_hash THEN
    RETURN QUERY SELECT
      v_idempotency.idempotency_result_reference,
      'INVITATION_IDEMPOTENCY_CONFLICT'::text,
      true,
      false,
      false,
      v_idempotency.idempotency_completed_at;
    RETURN;
  END IF;

  -- Idempotency suppresses duplicate side effects, but never freezes a positive
  -- eligibility snapshot. Revalidate live token metadata, terminal state, and
  -- DB-time expiry before returning any prior success.
  IF v_validation.invitation_error_code IS NOT NULL THEN
    IF v_idempotency.idempotency_status = 'pending' THEN
      PERFORM v12_invitation.write_event(
        p_invitation_id, 'validation_failed', v_actor_account_id, p_actor_auth_user_id,
        'blocked', v_validation.invitation_error_code, p_request_id
      );
      PERFORM v12_invitation.finish_idempotency(
        v_idempotency.idempotency_record_id,
        p_invitation_id,
        v_validation.invitation_error_code
      );
    END IF;
    RETURN QUERY SELECT
      p_invitation_id,
      v_validation.invitation_error_code,
      v_idempotency.idempotency_status IN ('completed', 'failed'),
      false,
      false,
      NULL::timestamptz;
    RETURN;
  END IF;

  IF v_idempotency.idempotency_status IN ('completed', 'failed') THEN
    RETURN QUERY
    SELECT
      v_idempotency.idempotency_result_reference,
      v_idempotency.idempotency_error_code,
      true,
      v_idempotency.idempotency_error_code IS NULL,
      v_idempotency.idempotency_error_code IS NULL,
      v_idempotency.idempotency_completed_at;
    RETURN;
  END IF;

  PERFORM v12_invitation.write_event(
    p_invitation_id, 'validated', v_actor_account_id, p_actor_auth_user_id,
    'success', NULL, p_request_id
  );

  PERFORM v12_invitation.finish_idempotency(
    v_idempotency.idempotency_record_id,
    p_invitation_id,
    NULL
  );

  SELECT record.idempotency_completed_at
  INTO v_validated_at
  FROM public.idempotency_records AS record
  WHERE record.idempotency_record_id = v_idempotency.idempotency_record_id;

  RETURN QUERY SELECT
    p_invitation_id,
    NULL::text,
    false,
    true,
    true,
    v_validated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_membership_invitation(
  p_invitation_id uuid,
  p_reason_code text,
  p_idempotency_key text,
  p_request_hash bytea,
  p_actor_auth_user_id uuid,
  p_request_id uuid
)
RETURNS TABLE (
  invitation_id uuid,
  invitation_status text,
  invitation_error_code text,
  invitation_is_replay boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invitation public.invitations%ROWTYPE;
  v_actor_account_id uuid;
  v_idempotency public.idempotency_records%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NULL
    OR p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,128}$'
    OR octet_length(p_request_hash) IS DISTINCT FROM 32
  THEN
    RETURN QUERY SELECT p_invitation_id, NULL::text,
      'INVITATION_IDEMPOTENCY_CONFLICT', false;
    RETURN;
  END IF;

  IF p_invitation_id IS NULL OR p_actor_auth_user_id IS NULL THEN
    RETURN QUERY SELECT p_invitation_id, NULL::text,
      'INVITATION_INVALID_SIGNATURE', false;
    RETURN;
  END IF;

  SELECT invitation.*
  INTO v_invitation
  FROM public.invitations AS invitation
  WHERE invitation.invitation_id = p_invitation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT p_invitation_id, NULL::text, 'INVITATION_NOT_FOUND', false;
    RETURN;
  END IF;

  PERFORM 1
  FROM public.memberships AS membership
  WHERE membership.membership_id = v_invitation.invitation_membership_id
  FOR UPDATE;

  v_actor_account_id := v12_invitation.actor_can_manage_membership(
    p_actor_auth_user_id,
    v_invitation.invitation_membership_id
  );
  IF v_actor_account_id IS NULL THEN
    RETURN QUERY SELECT p_invitation_id, NULL::text, 'INVITATION_NOT_FOUND', false;
    RETURN;
  END IF;

  PERFORM 1
  FROM public.accounts AS actor
  WHERE actor.account_id = v_actor_account_id
    AND actor.account_auth_user_id = p_actor_auth_user_id
    AND actor.account_status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT p_invitation_id, NULL::text, 'INVITATION_NOT_FOUND', false;
    RETURN;
  END IF;

  INSERT INTO public.idempotency_records (
    idempotency_key,
    idempotency_operation_type,
    idempotency_actor_account_id,
    idempotency_request_hash,
    idempotency_expires_at
  )
  VALUES (
    p_idempotency_key,
    'invitation_revoke',
    v_actor_account_id,
    p_request_hash,
    greatest(v_invitation.invitation_expires_at + interval '1 day', now() + interval '1 day')
  )
  ON CONFLICT DO NOTHING;

  SELECT record.*
  INTO v_idempotency
  FROM public.idempotency_records AS record
  WHERE record.idempotency_operation_type = 'invitation_revoke'
    AND record.idempotency_actor_account_id = v_actor_account_id
    AND record.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF v_idempotency.idempotency_request_hash IS DISTINCT FROM p_request_hash THEN
    RETURN QUERY SELECT v_idempotency.idempotency_result_reference, NULL::text,
      'INVITATION_IDEMPOTENCY_CONFLICT', true;
    RETURN;
  END IF;
  IF v_idempotency.idempotency_status IN ('completed', 'failed') THEN
    RETURN QUERY
    SELECT
      v_idempotency.idempotency_result_reference,
      CASE WHEN v_idempotency.idempotency_error_code IS NULL THEN 'revoked' ELSE NULL END,
      v_idempotency.idempotency_error_code,
      true;
    RETURN;
  END IF;

  IF p_reason_code IS NULL
    OR p_reason_code NOT IN (
      'operator_revoked', 'duplicate_invitation',
      'membership_ineligible', 'security_response'
    )
  THEN
    PERFORM v12_invitation.write_event(
      p_invitation_id, 'validation_failed', v_actor_account_id, p_actor_auth_user_id,
      'blocked', 'INVITATION_IDEMPOTENCY_CONFLICT', p_request_id
    );
    PERFORM v12_invitation.finish_idempotency(
      v_idempotency.idempotency_record_id, p_invitation_id,
      'INVITATION_IDEMPOTENCY_CONFLICT'
    );
    RETURN QUERY SELECT p_invitation_id, v_invitation.invitation_status,
      'INVITATION_IDEMPOTENCY_CONFLICT', false;
    RETURN;
  END IF;

  IF v_invitation.invitation_status = 'accepted' THEN
    PERFORM v12_invitation.write_event(
      p_invitation_id, 'validation_failed', v_actor_account_id, p_actor_auth_user_id,
      'blocked', 'INVITATION_ALREADY_ACCEPTED', p_request_id
    );
    PERFORM v12_invitation.finish_idempotency(
      v_idempotency.idempotency_record_id, p_invitation_id,
      'INVITATION_ALREADY_ACCEPTED'
    );
    RETURN QUERY SELECT p_invitation_id, 'accepted',
      'INVITATION_ALREADY_ACCEPTED', false;
    RETURN;
  ELSIF v_invitation.invitation_status = 'revoked' THEN
    PERFORM v12_invitation.write_event(
      p_invitation_id, 'validation_failed', v_actor_account_id, p_actor_auth_user_id,
      'blocked', 'INVITATION_REVOKED', p_request_id
    );
    PERFORM v12_invitation.finish_idempotency(
      v_idempotency.idempotency_record_id, p_invitation_id,
      'INVITATION_REVOKED'
    );
    RETURN QUERY SELECT p_invitation_id, 'revoked', 'INVITATION_REVOKED', false;
    RETURN;
  ELSIF v_invitation.invitation_status = 'expired'
    OR v_invitation.invitation_expires_at <= clock_timestamp()
  THEN
    IF v_invitation.invitation_status = 'pending' THEN
      UPDATE public.invitations
      SET
        invitation_status = 'expired',
        invitation_marked_expired_at = clock_timestamp()
      WHERE invitations.invitation_id = p_invitation_id;
      PERFORM v12_invitation.write_event(
        p_invitation_id, 'expired', v_actor_account_id, p_actor_auth_user_id,
        'success', 'INVITATION_EXPIRED', p_request_id
      );
    END IF;
    PERFORM v12_invitation.finish_idempotency(
      v_idempotency.idempotency_record_id, p_invitation_id,
      'INVITATION_EXPIRED'
    );
    RETURN QUERY SELECT p_invitation_id, 'expired', 'INVITATION_EXPIRED', false;
    RETURN;
  END IF;

  UPDATE public.invitations
  SET
    invitation_status = 'revoked',
    invitation_revoked_at = clock_timestamp(),
    invitation_revoked_by_account_id = v_actor_account_id,
    invitation_revoke_reason = p_reason_code
  WHERE invitations.invitation_id = p_invitation_id;

  PERFORM v12_invitation.write_event(
    p_invitation_id, 'revoked', v_actor_account_id, p_actor_auth_user_id,
    'success', p_reason_code, p_request_id
  );
  PERFORM v12_invitation.finish_idempotency(
    v_idempotency.idempotency_record_id,
    p_invitation_id,
    NULL
  );

  RETURN QUERY SELECT p_invitation_id, 'revoked', NULL::text, false;
END;
$$;

COMMENT ON FUNCTION public.create_membership_invitation(uuid, uuid, bytea, smallint, smallint, text, timestamptz, timestamptz, text, text, text, bytea, uuid, uuid) IS 'Creates one pending Invitation from Edge-generated HMAC token metadata without receiving or storing the plaintext token.';
COMMENT ON FUNCTION public.resend_membership_invitation(uuid, bytea, smallint, smallint, text, timestamptz, timestamptz, text, bytea, uuid, uuid) IS 'Rotates the HMAC token metadata of a live pending Invitation; same-key retries never reproduce a plaintext token.';
COMMENT ON FUNCTION public.validate_membership_invitation(uuid, bytea, smallint, smallint, timestamptz, timestamptz, text, bytea, uuid, uuid) IS 'Performs authenticated, non-consuming Invitation preflight validation. Each idempotent retry rechecks current token metadata, terminal state, and DB-time expiry before returning eligibility. Success is not a reservation or acceptance; PR-03 must revalidate and finish onboarding in one atomic transaction.';
COMMENT ON FUNCTION public.revoke_membership_invitation(uuid, text, text, bytea, uuid, uuid) IS 'Atomically revokes one pending Invitation after deriving and authorizing the actor from a trusted Auth UUID.';

REVOKE ALL ON FUNCTION v12_invitation.actor_can_manage_membership(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION v12_invitation.write_event(uuid, text, uuid, uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION v12_invitation.finish_idempotency(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION v12_invitation.validate_token_snapshot(uuid, bytea, smallint, smallint, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_membership_invitation(uuid, uuid, bytea, smallint, smallint, text, timestamptz, timestamptz, text, text, text, bytea, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resend_membership_invitation(uuid, bytea, smallint, smallint, text, timestamptz, timestamptz, text, bytea, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_membership_invitation(uuid, bytea, smallint, smallint, timestamptz, timestamptz, text, bytea, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_membership_invitation(uuid, text, text, bytea, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_membership_invitation(uuid, uuid, bytea, smallint, smallint, text, timestamptz, timestamptz, text, text, text, bytea, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.resend_membership_invitation(uuid, bytea, smallint, smallint, text, timestamptz, timestamptz, text, bytea, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_membership_invitation(uuid, bytea, smallint, smallint, timestamptz, timestamptz, text, bytea, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_membership_invitation(uuid, text, text, bytea, uuid, uuid)
  TO service_role;

REVOKE ALL ON TABLE public.invitations, public.invitation_events,
  public.idempotency_records, public.audit_logs
  FROM anon, authenticated, service_role;

COMMIT;

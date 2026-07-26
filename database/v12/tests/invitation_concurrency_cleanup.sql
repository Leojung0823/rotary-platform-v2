\set ON_ERROR_STOP on

BEGIN;
DELETE FROM public.audit_logs
WHERE audit_log_target_id IN (
  '84000000-0000-4000-8000-000000000002',
  '84000000-0000-4000-8000-000000000003'
);
DELETE FROM public.invitation_events
WHERE invitation_event_invitation_id IN (
  '84000000-0000-4000-8000-000000000002',
  '84000000-0000-4000-8000-000000000003'
);
DELETE FROM public.idempotency_records
WHERE idempotency_actor_auth_user_id IN (
    '85000000-0000-4000-8000-000000000002'
  )
  OR idempotency_actor_account_id = '82500000-0000-4000-8000-000000000002';
DELETE FROM public.invitations
WHERE invitation_membership_id IN (
  '83000000-0000-4000-8000-000000000003'
);
DELETE FROM public.membership_role_assignments
WHERE membership_role_assignment_membership_id = '83000000-0000-4000-8000-000000000002';
DELETE FROM public.memberships
WHERE membership_id IN (
  '83000000-0000-4000-8000-000000000002',
  '83000000-0000-4000-8000-000000000003'
);
DELETE FROM public.accounts
WHERE account_id = '82500000-0000-4000-8000-000000000002';
DELETE FROM public.people
WHERE person_id IN (
  '82000000-0000-4000-8000-000000000002',
  '82000000-0000-4000-8000-000000000003'
);
DELETE FROM public.clubs
WHERE club_id = '81000000-0000-4000-8000-000000000001';
DELETE FROM public.districts
WHERE district_id = '80000000-0000-4000-8000-000000000001';
COMMIT;

-- Verifies that one email with multiple club invitations must choose an explicit invite.
-- Run against a freshly reset local database. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'selection-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'multi-invite@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'unconfirmed@example.test', '', null, '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'suspended@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('21000000-0000-0000-0000-000000000001', '邀請選擇管理員', 'selection-admin@example.test'),
  ('21000000-0000-0000-0000-000000000004', '已停權帳號', 'suspended@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  (
    '31000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    'selection-admin@example.test',
    '邀請選擇管理員',
    'active'
  ),
  (
    '31000000-0000-0000-0000-000000000004',
    '11000000-0000-0000-0000-000000000004',
    '21000000-0000-0000-0000-000000000004',
    'suspended@example.test',
    '已停權帳號',
    'suspended'
  );

insert into public.platform_roles (app_account_id, role_key)
values ('31000000-0000-0000-0000-000000000001', 'superadmin');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select public.create_club_with_initial_operator_invitation(
  'SELECT-A', '邀請選擇測試社 A', 'multi-invite@example.test', '多邀請使用者', 'selection-club-a'
);
select public.create_club_with_initial_operator_invitation(
  'SELECT-B', '邀請選擇測試社 B', 'multi-invite@example.test', '多邀請使用者', 'selection-club-b'
);
select public.create_club_with_initial_operator_invitation(
  'SELECT-C', '邀請選擇測試社 C', 'unconfirmed@example.test', '未驗證使用者', 'selection-club-c'
);
select public.create_club_with_initial_operator_invitation(
  'SELECT-D', '邀請選擇測試社 D', 'suspended@example.test', '已停權使用者', 'selection-club-d'
);
reset role;

create temporary table invitation_selection_ids (
  key text primary key,
  id uuid not null
);

insert into invitation_selection_ids (key, id)
select 'club-a', id from public.clubs where club_code = 'SELECT-A'
union all
select 'club-b', id from public.clubs where club_code = 'SELECT-B'
union all
select 'invite-a', invite.id
from public.club_operator_invites as invite
join public.clubs as club on club.id = invite.club_id
where club.club_code = 'SELECT-A'
union all
select 'invite-b', invite.id
from public.club_operator_invites as invite
join public.clubs as club on club.id = invite.club_id
where club.club_code = 'SELECT-B';

grant select on invitation_selection_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);

do $$
declare
  available_count integer;
begin
  select count(*) into available_count
  from public.list_current_operator_invitations();

  if available_count <> 2 then
    raise exception 'Expected two selectable invitations, found %.', available_count;
  end if;
end;
$$;

-- The old nullable entrypoint must no longer be callable by a browser role.
do $$
begin
  begin
    perform public.accept_operator_invitation(null);
    raise exception 'Legacy ambiguous invitation acceptance remained executable.';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

do $$
declare
  selected_result jsonb;
  selected_again jsonb;
  expected_club_id uuid := (
    select id from invitation_selection_ids where key = 'club-b'
  );
  selected_invite_id uuid := (
    select id from invitation_selection_ids where key = 'invite-b'
  );
begin
  selected_result := public.accept_selected_operator_invitation(selected_invite_id);
  selected_again := public.accept_selected_operator_invitation(selected_invite_id);

  if (selected_result->>'club_id')::uuid is distinct from expected_club_id then
    raise exception 'Explicit selection accepted the wrong club.';
  end if;
  if (selected_again->>'idempotent')::boolean is not true then
    raise exception 'Explicit invitation acceptance was not idempotent.';
  end if;
end;
$$;

reset role;

do $$
declare
  club_a_id uuid := (select id from invitation_selection_ids where key = 'club-a');
  club_b_id uuid := (select id from invitation_selection_ids where key = 'club-b');
  multi_account_id uuid := (
    select id from public.app_accounts where login_email_normalized = 'multi-invite@example.test'
  );
begin
  if exists (
    select 1 from public.club_operator_permissions
    where club_id = club_a_id and app_account_id = multi_account_id
  ) then
    raise exception 'Unselected Club A invitation granted a permission.';
  end if;

  if not exists (
    select 1 from public.club_operator_permissions
    where club_id = club_b_id
      and app_account_id = multi_account_id
      and assignment_status = 'active'
  ) then
    raise exception 'Selected Club B invitation did not grant an active permission.';
  end if;
end;
$$;

-- An Auth identity without a confirmed email cannot enumerate invitations.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000003', true);
do $$
begin
  begin
    perform * from public.list_current_operator_invitations();
    raise exception 'Unconfirmed email enumerated invitations.';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

-- A confirmed but suspended application account cannot enumerate invitations.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000004', true);
do $$
begin
  begin
    perform * from public.list_current_operator_invitations();
    raise exception 'Suspended account enumerated invitations.';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

rollback;

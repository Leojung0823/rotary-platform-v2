-- Event registration relational tenant integrity verification.
-- Run only against Supabase local. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '15000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'event-integrity@example.test', '', now(), '{}', '{}', now(), now()
);

insert into public.people (id, canonical_name, primary_email) values (
  '25000000-0000-0000-0000-000000000001', '活動完整性測試帳號', 'event-integrity@example.test'
);

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values (
  '35000000-0000-0000-0000-000000000001',
  '15000000-0000-0000-0000-000000000001',
  '25000000-0000-0000-0000-000000000001',
  'event-integrity@example.test', '活動完整性測試帳號', 'active'
);

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('55000000-0000-4000-8000-000000000001', 'EVENT-INTEGRITY-A', '活動完整性甲社', 'active', now()),
  ('55000000-0000-4000-8000-000000000002', 'EVENT-INTEGRITY-B', '活動完整性乙社', 'active', now());

insert into public.club_events (
  id, club_id, event_type, title, starts_at, ends_at, registration_deadline,
  event_status, created_by_app_account_id, updated_by_app_account_id, published_at
) values (
  '85000000-0000-4000-8000-000000000001',
  '55000000-0000-4000-8000-000000000001',
  'regular_meeting', '活動完整性測試例會',
  now() + interval '3 days', now() + interval '3 days 2 hours', now() + interval '2 days',
  'published',
  '35000000-0000-0000-0000-000000000001',
  '35000000-0000-0000-0000-000000000001',
  now()
);

insert into public.event_registrations (
  id, club_id, event_id, app_account_id, response, guest_count, note, responded_at
) values (
  '95000000-0000-4000-8000-000000000001',
  '55000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000001',
  '35000000-0000-0000-0000-000000000001',
  'attending', 0, '', now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_registrations_event_club_fkey'
      and conrelid = 'public.event_registrations'::regclass
      and contype = 'f'
  ) then
    raise exception 'composite event registration tenant foreign key is missing';
  end if;

  begin
    insert into public.event_registrations (
      id, club_id, event_id, app_account_id, response, guest_count, note, responded_at
    ) values (
      '95000000-0000-4000-8000-000000000002',
      '55000000-0000-4000-8000-000000000002',
      '85000000-0000-4000-8000-000000000001',
      '35000000-0000-0000-0000-000000000001',
      'declined', 0, '', now()
    );
    raise exception 'mismatched event and club registration was inserted';
  exception when foreign_key_violation then null;
  end;

  begin
    update public.club_events
    set id = '85000000-0000-4000-8000-000000000099'
    where id = '85000000-0000-4000-8000-000000000001';
    raise exception 'club event primary key was mutable';
  exception when check_violation then null;
  end;

  begin
    update public.event_registrations
    set id = '95000000-0000-4000-8000-000000000099'
    where id = '95000000-0000-4000-8000-000000000001';
    raise exception 'event registration primary key was mutable';
  exception when check_violation then null;
  end;

  begin
    update public.event_registrations
    set club_id = '55000000-0000-4000-8000-000000000002'
    where id = '95000000-0000-4000-8000-000000000001';
    raise exception 'event registration club was mutable';
  exception when check_violation then null;
  end;
end $$;

rollback;

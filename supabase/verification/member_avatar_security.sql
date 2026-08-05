-- Member avatar storage ownership and reference verification.
-- Run only against Supabase local. All account fixtures are rolled back.

begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '16400000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'avatar-member@example.test', '', now(), '{}', '{}', now(), now());
insert into public.people (id, canonical_name, primary_email)
values ('26400000-0000-4000-8000-000000000011', '照片測試社員', 'avatar-member@example.test');
insert into public.app_accounts (id, auth_user_id, person_id, login_email, account_display_name, account_status)
values ('36400000-0000-4000-8000-000000000011', '16400000-0000-0000-0000-000000000001', '26400000-0000-4000-8000-000000000011', 'avatar-member@example.test', '照片測試社員', 'active');

do $$
declare policy_count integer;
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'member-avatars' and public and file_size_limit = 5242880
      and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']::text[]
  ) then raise exception 'member avatar bucket restrictions are missing'; end if;
  select count(*) into policy_count
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname in ('member avatar public read', 'member uploads own avatar', 'member updates own avatar', 'member deletes own avatar');
  if policy_count <> 4 then raise exception 'member avatar storage policies are incomplete'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '16400000-0000-0000-0000-000000000001', true);
do $$
declare saved text;
begin
  begin
    perform public.update_my_avatar_reference('member-avatar:ffffffff-ffff-ffff-ffff-ffffffffffff/profile');
    raise exception 'member stored another account avatar reference';
  exception when invalid_parameter_value then null;
  end;
  saved := public.update_my_avatar_reference('member-avatar:16400000-0000-0000-0000-000000000001/profile');
  if saved <> 'member-avatar:16400000-0000-0000-0000-000000000001/profile' then raise exception 'member avatar reference was not saved'; end if;
end $$;
reset role;

do $$
begin
  if not exists (
    select 1 from public.people
    where id = '26400000-0000-4000-8000-000000000011'
      and avatar_url = 'member-avatar:16400000-0000-0000-0000-000000000001/profile'
  ) then raise exception 'person avatar was not updated'; end if;
  if not exists (
    select 1 from public.audit_logs
    where action_key = 'member.self_avatar_updated'
      and actor_app_account_id = '36400000-0000-4000-8000-000000000011'
  ) then raise exception 'member avatar audit was not recorded'; end if;
end $$;

rollback;

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'member-avatars',
  'member-avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "member avatar public read"
on storage.objects for select
to public
using (bucket_id = 'member-avatars');

create policy "member uploads own avatar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'member-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and (storage.filename(name)) = 'profile'
);

create policy "member updates own avatar"
on storage.objects for update
to authenticated
using (
  bucket_id = 'member-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and (storage.filename(name)) = 'profile'
)
with check (
  bucket_id = 'member-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and (storage.filename(name)) = 'profile'
);

create policy "member deletes own avatar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'member-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and (storage.filename(name)) = 'profile'
);

create or replace function public.update_my_avatar_reference(p_avatar_reference text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor public.app_accounts;
  normalized_reference text := nullif(btrim(coalesce(p_avatar_reference, '')), '');
  expected_reference text := 'member-avatar:' || auth.uid()::text || '/profile';
begin
  select account.* into actor
  from public.app_accounts as account
  where account.auth_user_id = auth.uid()
    and account.account_status = 'active'
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'active_account_required';
  end if;
  if normalized_reference is not null and normalized_reference <> expected_reference then
    raise exception using errcode = '22023', message = 'invalid_member_avatar_reference';
  end if;

  update public.people
  set avatar_url = normalized_reference
  where id = actor.person_id;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    null, actor.id, 'member.self_avatar_updated', 'person', actor.person_id,
    jsonb_build_object('has_avatar', normalized_reference is not null)
  );

  return normalized_reference;
end;
$$;

revoke all on function public.update_my_avatar_reference(text) from public, anon;
grant execute on function public.update_my_avatar_reference(text) to authenticated;

commit;

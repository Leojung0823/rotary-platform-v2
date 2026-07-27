begin;

create table public.board_posts (
  id uuid primary key default extensions.gen_random_uuid(),
  author_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  content text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint board_posts_content_not_blank check (btrim(content) <> ''),
  constraint board_posts_content_length check (char_length(content) between 1 and 1000),
  constraint board_posts_status_check check (status in ('active', 'deleted')),
  constraint board_posts_deleted_consistency check (
    (status = 'active' and deleted_at is null)
    or (status = 'deleted' and deleted_at is not null)
  )
);

comment on table public.board_posts is
  'Authenticated plain-text message board posts. Authors and timestamps are database controlled.';

create index board_posts_active_pagination_idx
  on public.board_posts (created_at desc, id desc)
  where status = 'active';

create index board_posts_author_status_idx
  on public.board_posts (author_app_account_id, status, created_at desc, id desc);

create or replace function public.normalize_board_post_content(p_content text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select btrim(replace(replace(p_content, E'\r\n', E'\n'), E'\r', E'\n'))
$$;

create or replace function public.protect_board_post_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.author_app_account_id is distinct from new.author_app_account_id then
    raise exception using errcode = '23514', message = 'board_post_author_immutable';
  end if;

  if old.created_at is distinct from new.created_at then
    raise exception using errcode = '23514', message = 'board_post_created_at_immutable';
  end if;

  if old.status = 'deleted' and new.status <> 'deleted' then
    raise exception using errcode = '23514', message = 'deleted_board_post_cannot_be_restored';
  end if;

  new.updated_at := now();

  if new.status = 'deleted' then
    new.deleted_at := coalesce(old.deleted_at, now());
  else
    new.deleted_at := null;
  end if;

  return new;
end;
$$;

create trigger board_posts_protect_update
before update on public.board_posts
for each row execute function public.protect_board_post_update();

create or replace function public.prevent_board_post_hard_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = '42501', message = 'board_post_hard_delete_forbidden';
end;
$$;

create trigger board_posts_prevent_hard_delete
before delete on public.board_posts
for each row execute function public.prevent_board_post_hard_delete();

alter table public.board_posts enable row level security;
revoke all on table public.board_posts from public, anon, authenticated;

create or replace function public.list_board_posts(
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  result jsonb;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authenticated_account_required';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using errcode = '22023', message = 'invalid_board_limit';
  end if;

  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    raise exception using errcode = '22023', message = 'invalid_board_cursor';
  end if;

  if p_cursor_id is not null and not exists (
    select 1
    from public.board_posts as cursor_post
    where cursor_post.id = p_cursor_id
      and cursor_post.created_at = p_cursor_created_at
      and cursor_post.status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'invalid_board_cursor';
  end if;

  with page as materialized (
    select post.id, post.content, post.created_at, post.updated_at,
      account.account_display_name as author_display_name,
      person.avatar_url as author_avatar_url,
      post.author_app_account_id = actor_id as can_edit,
      post.author_app_account_id = actor_id as can_delete
    from public.board_posts as post
    join public.app_accounts as account on account.id = post.author_app_account_id
    join public.people as person on person.id = account.person_id
    where post.status = 'active'
      and (
        p_cursor_created_at is null
        or post.created_at < p_cursor_created_at
        or (post.created_at = p_cursor_created_at and post.id < p_cursor_id)
      )
    order by post.created_at desc, post.id desc
    limit p_limit + 1
  ), visible as materialized (
    select * from page
    order by created_at desc, id desc
    limit p_limit
  )
  select jsonb_build_object(
    'posts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', visible.id,
          'content', visible.content,
          'created_at', visible.created_at,
          'updated_at', visible.updated_at,
          'author_display_name', visible.author_display_name,
          'author_avatar_url', visible.author_avatar_url,
          'can_edit', visible.can_edit,
          'can_delete', visible.can_delete
        ) order by visible.created_at desc, visible.id desc
      )
      from visible
    ), '[]'::jsonb),
    'next_cursor', case
      when (select count(*) from page) > p_limit then (
        select jsonb_build_object('v', 1, 'created_at', visible.created_at, 'id', visible.id)
        from visible
        order by visible.created_at asc, visible.id asc
        limit 1
      )
      else null
    end
  ) into result;

  return result;
end;
$$;

create or replace function public.create_board_post(p_content text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  normalized_content text := public.normalize_board_post_content(p_content);
  created_post public.board_posts;
  result jsonb;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authenticated_account_required';
  end if;

  if normalized_content is null or normalized_content = '' or char_length(normalized_content) > 1000 then
    raise exception using errcode = '22023', message = 'invalid_board_content';
  end if;

  insert into public.board_posts (author_app_account_id, content)
  values (actor_id, normalized_content)
  returning * into created_post;

  select jsonb_build_object(
    'id', created_post.id,
    'content', created_post.content,
    'created_at', created_post.created_at,
    'updated_at', created_post.updated_at,
    'author_display_name', account.account_display_name,
    'author_avatar_url', person.avatar_url,
    'can_edit', true,
    'can_delete', true
  ) into result
  from public.app_accounts as account
  join public.people as person on person.id = account.person_id
  where account.id = actor_id;

  return result;
end;
$$;

create or replace function public.update_own_board_post(p_post_id uuid, p_content text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  normalized_content text := public.normalize_board_post_content(p_content);
  updated_post public.board_posts;
  result jsonb;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authenticated_account_required';
  end if;

  if p_post_id is null or normalized_content is null or normalized_content = ''
     or char_length(normalized_content) > 1000 then
    raise exception using errcode = '22023', message = 'invalid_board_request';
  end if;

  update public.board_posts
  set content = normalized_content
  where id = p_post_id
    and author_app_account_id = actor_id
    and status = 'active'
  returning * into updated_post;

  if not found then
    raise exception using errcode = 'P0002', message = 'board_post_not_available';
  end if;

  select jsonb_build_object(
    'id', updated_post.id,
    'content', updated_post.content,
    'created_at', updated_post.created_at,
    'updated_at', updated_post.updated_at,
    'author_display_name', account.account_display_name,
    'author_avatar_url', person.avatar_url,
    'can_edit', true,
    'can_delete', true
  ) into result
  from public.app_accounts as account
  join public.people as person on person.id = account.person_id
  where account.id = actor_id;

  return result;
end;
$$;

create or replace function public.delete_own_board_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authenticated_account_required';
  end if;

  if p_post_id is null then
    raise exception using errcode = '22023', message = 'invalid_board_request';
  end if;

  update public.board_posts
  set status = 'deleted', deleted_at = now()
  where id = p_post_id
    and author_app_account_id = actor_id
    and status = 'active';

  if not found then
    raise exception using errcode = 'P0002', message = 'board_post_not_available';
  end if;
end;
$$;

revoke all on function public.normalize_board_post_content(text) from public, anon, authenticated;
revoke all on function public.protect_board_post_update() from public, anon, authenticated;
revoke all on function public.prevent_board_post_hard_delete() from public, anon, authenticated;
revoke all on function public.list_board_posts(timestamptz, uuid, integer) from public, anon, authenticated;
revoke all on function public.create_board_post(text) from public, anon, authenticated;
revoke all on function public.update_own_board_post(uuid, text) from public, anon, authenticated;
revoke all on function public.delete_own_board_post(uuid) from public, anon, authenticated;

grant execute on function public.list_board_posts(timestamptz, uuid, integer) to authenticated;
grant execute on function public.create_board_post(text) to authenticated;
grant execute on function public.update_own_board_post(uuid, text) to authenticated;
grant execute on function public.delete_own_board_post(uuid) to authenticated;

commit;

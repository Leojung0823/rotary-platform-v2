-- Club join links let an unknown person create a membership, so the boundaries
-- that matter are: the table is unreachable from a browser, redemption is
-- server-only, and the public preview answers nothing beyond one club name.
-- Run against a freshly reset local database. All fixtures are rolled back.

begin;

do $$
begin
  -- Redemption creates people, accounts and memberships. No browser role may
  -- reach it; only the server, acting as service_role, may.
  if has_function_privilege('anon', 'public.redeem_club_join_link_trusted(text,uuid,text,text,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.redeem_club_join_link_trusted(text,uuid,text,text,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.redeem_club_join_link_trusted(text,uuid,text,text,text,text)', 'EXECUTE') then
    raise exception 'join link redemption privilege boundary is wrong';
  end if;

  -- Creating and disabling a link are officer actions behind a signed-in session.
  if has_function_privilege('anon', 'public.create_club_join_link(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.create_club_join_link(uuid)', 'EXECUTE') then
    raise exception 'join link creation privilege boundary is wrong';
  end if;
  if has_function_privilege('anon', 'public.disable_club_join_link(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.disable_club_join_link(uuid)', 'EXECUTE') then
    raise exception 'join link disable privilege boundary is wrong';
  end if;
  if has_function_privilege('anon', 'public.get_club_join_links_admin(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_club_join_links_admin(uuid)', 'EXECUTE') then
    raise exception 'join link admin projection privilege boundary is wrong';
  end if;

  -- The landing page runs before sign-in, so anon must be able to preview.
  if not has_function_privilege('anon', 'public.preview_club_join_link(text)', 'EXECUTE') then
    raise exception 'join link preview must be reachable before sign-in';
  end if;
end;
$$;

do $$
begin
  -- The table holds token hashes. A browser role that could read it could
  -- enumerate every club's live link, so no direct grant may exist.
  if has_table_privilege('anon', 'public.club_join_links', 'SELECT')
     or has_table_privilege('authenticated', 'public.club_join_links', 'SELECT')
     or has_table_privilege('anon', 'public.club_join_links', 'INSERT')
     or has_table_privilege('authenticated', 'public.club_join_links', 'INSERT')
     or has_table_privilege('authenticated', 'public.club_join_links', 'UPDATE') then
    raise exception 'club_join_links must not be readable or writable from a browser role';
  end if;

  if not (
    select relrowsecurity from pg_catalog.pg_class
    where oid = 'public.club_join_links'::regclass
  ) then
    raise exception 'club_join_links must have row level security enabled';
  end if;
end;
$$;

do $$
declare
  admin_definition text;
  preview_definition text;
begin
  select pg_catalog.pg_get_functiondef(oid) into admin_definition
  from pg_catalog.pg_proc
  where proname = 'get_club_join_links_admin' and pronamespace = 'public'::regnamespace;

  -- The officer projection shows a prefix so two links can be told apart in the
  -- audit log. Projecting token_hash would hand back a replayable secret.
  if position('token_hash' in admin_definition) > 0 then
    raise exception 'join link admin projection must not expose token_hash';
  end if;
  if position('token_prefix' in admin_definition) = 0 then
    raise exception 'join link admin projection must expose the token prefix';
  end if;

  select pg_catalog.pg_get_functiondef(oid) into preview_definition
  from pg_catalog.pg_proc
  where proname = 'preview_club_join_link' and pronamespace = 'public'::regnamespace;

  -- A wrong token and a switched-off link must be indistinguishable, or the
  -- endpoint becomes a club enumerator.
  if position('unavailable' in preview_definition) = 0 then
    raise exception 'join link preview must collapse every failure to one reason';
  end if;
  if position('club_join_link_enabled' in preview_definition) = 0 then
    raise exception 'join link preview must be gated by the feature flag';
  end if;
end;
$$;

do $$
declare
  redeem_definition text;
begin
  select pg_catalog.pg_get_functiondef(oid) into redeem_definition
  from pg_catalog.pg_proc
  where proname = 'redeem_club_join_link_trusted' and pronamespace = 'public'::regnamespace;

  -- A disabled link must stop being redeemable the moment it is switched off:
  -- that switch is the only control this feature has.
  if position('link_status <> ''active''' in redeem_definition) = 0 then
    raise exception 'join link redemption must refuse a link that is not active';
  end if;
  if position('club_join_link_enabled' in redeem_definition) = 0 then
    raise exception 'join link redemption must be gated by the feature flag';
  end if;
  -- A repeat visitor must be signed in, not duplicated into a second person.
  if position('already_member' in redeem_definition) = 0 then
    raise exception 'join link redemption must handle an already-bound LINE subject';
  end if;
end;
$$;

rollback;

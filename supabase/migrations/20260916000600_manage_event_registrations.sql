begin;

-- 幹部要看得到誰報名了，也要能替個別社員報名或取消。
--
-- The management card showed a count -- 「目前參加 1 人 · 2 個名額已使用」 --
-- and nothing else. Who those people are, and the ordinary business of a
-- member phoning to say they cannot come, had no home in the product at all.

-- Whether one membership is addressed by an event, asked about someone other
-- than the caller. event_includes_current_member answers the same question for
-- the caller themselves and cannot be reused here.
create or replace function public.membership_is_in_event_audience(
  p_event_id uuid,
  p_membership_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select (
    not exists (select 1 from public.club_event_audiences where event_id = p_event_id)
    and not exists (select 1 from public.club_event_audience_members where event_id = p_event_id)
  ) or exists (
    select 1
    from public.club_event_audiences as audience
    join public.club_membership_tags as tagged on tagged.tag_id = audience.tag_id
    where audience.event_id = p_event_id
      and tagged.membership_id = p_membership_id
  ) or exists (
    select 1 from public.club_event_audience_members as audience
    where audience.event_id = p_event_id
      and audience.membership_id = p_membership_id
  )
$$;

create or replace function public.list_club_event_registrations(
  p_club_id uuid,
  p_event_id uuid
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
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'event.manage') then
    raise exception using errcode = '42501', message = 'event_manage_required';
  end if;
  if not exists (
    select 1 from public.club_events where id = p_event_id and club_id = p_club_id
  ) then
    raise exception using errcode = 'P0002', message = 'event_not_available';
  end if;

  -- Every active member of the club, answered or not. A roster of only the
  -- people who replied answers "who is coming" but not "who have we not heard
  -- from", which is the question an officer chasing replies actually has.
  select jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'membership_id', membership.id,
        'display_name', person.canonical_name,
        'response', coalesce(registration.response, 'no_reply'),
        'guest_count', coalesce(registration.guest_count, 0),
        'note', coalesce(registration.note, ''),
        'responded_at', registration.responded_at
      ) order by
        -- Attending first, then the ones still to chase, then declines: the
        -- order an officer reads this list in.
        case coalesce(registration.response, 'no_reply')
          when 'attending' then 1 when 'pending' then 2
          when 'no_reply' then 3 else 4
        end,
        person.canonical_name, membership.id)
      from public.club_memberships as membership
      join public.people as person on person.id = membership.person_id
      left join public.app_accounts as account
        on account.person_id = membership.person_id
       and account.account_status = 'active'
      left join public.event_registrations as registration
        on registration.event_id = p_event_id
       and registration.app_account_id = account.id
      where membership.club_id = p_club_id
        and membership.membership_status = 'active'
        -- A targeted event's list is the audience, not the whole club.
        and public.membership_is_in_event_audience(p_event_id, membership.id)
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create or replace function public.set_event_registration_for_member(
  p_club_id uuid,
  p_event_id uuid,
  p_membership_id uuid,
  p_response text,
  p_guest_count integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_events;
  target_account uuid;
  normalized_reason text := btrim(coalesce(p_reason, ''));
  normalized_guests integer := coalesce(p_guest_count, 0);
  used_spots integer;
  saved public.event_registrations;
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'event.manage') then
    raise exception using errcode = '42501', message = 'event_manage_required';
  end if;
  if p_response not in ('pending', 'attending', 'declined')
     or normalized_guests < 0 or normalized_guests > 20
     or (p_response in ('pending', 'declined') and normalized_guests <> 0) then
    raise exception using errcode = '22023', message = 'invalid_event_registration';
  end if;
  -- Answering for someone else is a thing that happened off-system: a phone
  -- call, a message. Saying which is how the member can later see why their
  -- answer is what it is, and how the club can answer for the change.
  if normalized_reason = '' or char_length(normalized_reason) > 200 then
    raise exception using errcode = '22023', message = 'registration_reason_required';
  end if;

  select * into target from public.club_events
  where id = p_event_id and club_id = p_club_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'event_not_available'; end if;
  if target.event_status <> 'published' then
    raise exception using errcode = '22023', message = 'event_registration_closed';
  end if;
  -- The deadline is deliberately not applied. A member who phones an hour
  -- before the meeting is exactly the case this exists for, and the officer
  -- carries the responsibility that the audit row records.

  select account.id into target_account
  from public.club_memberships as membership
  join public.app_accounts as account
    on account.person_id = membership.person_id
   and account.account_status = 'active'
  where membership.id = p_membership_id
    and membership.club_id = p_club_id
    and membership.membership_status = 'active';
  if target_account is null then
    raise exception using errcode = 'P0002', message = 'membership_not_available';
  end if;
  if not public.membership_is_in_event_audience(p_event_id, p_membership_id) then
    raise exception using errcode = 'P0002', message = 'membership_not_available';
  end if;

  if p_response = 'attending' and target.capacity is not null then
    select coalesce(sum(1 + registration.guest_count), 0)::integer into used_spots
    from public.event_registrations as registration
    where registration.event_id = target.id
      and registration.response = 'attending'
      and registration.app_account_id <> target_account;
    if used_spots + 1 + normalized_guests > target.capacity then
      raise exception using errcode = '23514', message = 'event_capacity_full';
    end if;
  end if;

  insert into public.event_registrations (
    club_id, event_id, app_account_id, response, guest_count, note, responded_at
  ) values (
    p_club_id, target.id, target_account, p_response,
    case when p_response = 'attending' then normalized_guests else 0 end,
    normalized_reason, case when p_response = 'pending' then null else now() end
  )
  on conflict (event_id, app_account_id) do update set
    response = excluded.response,
    guest_count = excluded.guest_count,
    note = excluded.note,
    responded_at = excluded.responded_at
  returning * into saved;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'event.registration_set_by_officer', 'event_registration', saved.id,
    jsonb_build_object(
      'event_id', target.id,
      'membership_id', p_membership_id,
      'response', saved.response,
      'guest_count', saved.guest_count,
      'reason', normalized_reason
    ));

  return jsonb_build_object(
    'response', saved.response, 'guest_count', saved.guest_count, 'note', saved.note
  );
end;
$$;

revoke all on function public.list_club_event_registrations(uuid, uuid) from public, anon;
revoke all on function public.membership_is_in_event_audience(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_event_registration_for_member(uuid, uuid, uuid, text, integer, text) from public, anon;
grant execute on function public.list_club_event_registrations(uuid, uuid) to authenticated;
grant execute on function public.set_event_registration_for_member(uuid, uuid, uuid, text, integer, text) to authenticated;

commit;

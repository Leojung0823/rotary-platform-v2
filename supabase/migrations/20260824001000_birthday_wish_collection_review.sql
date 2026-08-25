begin;

-- Link a birthday notification delivery to the exact assignment it opened.
-- The message itself is shared, but completion is per recipient.
alter table public.club_message_recipients
  add column birthday_participant_id uuid;

alter table public.club_message_recipients
  add constraint club_message_recipients_birthday_participant_fkey
  foreign key (birthday_participant_id, club_id)
  references public.birthday_wish_campaign_participants (id, club_id)
  on delete restrict;

create index club_message_recipients_birthday_participant_idx
  on public.club_message_recipients (club_id, birthday_participant_id)
  where birthday_participant_id is not null;

create or replace function public.protect_club_message_recipient_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.message_id is distinct from new.message_id
     or old.membership_id is distinct from new.membership_id
     or old.club_id is distinct from new.club_id
     or old.birthday_participant_id is distinct from new.birthday_participant_id
     or old.created_at is distinct from new.created_at then
    raise exception using errcode = '23514', message = 'club_message_recipient_immutable';
  end if;
  return new;
end;
$$;

-- A participant may have one current submission and any number of immutable
-- hidden/deleted revisions. Existing rows become revision 1.
alter table public.birthday_wish_campaign_submissions
  add column revision_number integer not null default 1,
  add column hidden_at timestamptz,
  add column hidden_by_app_account_id uuid references public.app_accounts(id) on delete restrict;

alter table public.birthday_wish_campaign_submissions
  drop constraint birthday_submission_participant_unique;

-- Hidden rows may already exist from the earlier dark-launch contract. Give
-- them a stable timestamp before the new review metadata becomes mandatory.
update public.birthday_wish_campaign_submissions
set hidden_at = coalesce(updated_at, submitted_at, created_at)
where submission_status = 'hidden'
  and hidden_at is null;

alter table public.birthday_wish_campaign_submissions
  add constraint birthday_submission_revision_check
    check (revision_number between 1 and 1000000),
  add constraint birthday_submission_hidden_metadata_check
    check (
      (submission_status = 'hidden' and hidden_at is not null)
      or (submission_status <> 'hidden' and hidden_at is null)
    ),
  add constraint birthday_submission_hidden_actor_check
    check (submission_status = 'hidden' or hidden_by_app_account_id is null);

create unique index birthday_submission_participant_revision_unique
  on public.birthday_wish_campaign_submissions (participant_id, revision_number);

create unique index birthday_submission_one_current_unique
  on public.birthday_wish_campaign_submissions (participant_id)
  where submission_status in ('submitted', 'published');

create table public.birthday_wish_submission_events (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  participant_id uuid not null,
  submission_id uuid,
  event_type text not null,
  previous_status text,
  next_status text not null,
  actor_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  content_snapshot text,
  created_at timestamptz not null default now(),
  constraint birthday_submission_event_participant_club_fkey
    foreign key (participant_id, club_id)
    references public.birthday_wish_campaign_participants(id, club_id) on delete restrict,
  constraint birthday_submission_event_submission_club_fkey
    foreign key (submission_id, club_id)
    references public.birthday_wish_campaign_submissions(id, club_id) on delete restrict,
  constraint birthday_submission_event_type_check check (
    event_type in ('submitted', 'updated', 'resubmitted', 'deleted', 'published', 'hidden', 'declined')
  ),
  constraint birthday_submission_event_previous_status_check check (
    previous_status is null or previous_status in ('submitted', 'published', 'hidden', 'deleted')
  ),
  constraint birthday_submission_event_next_status_check check (
    next_status in ('submitted', 'published', 'hidden', 'deleted', 'declined')
  ),
  constraint birthday_submission_event_content_check check (
    content_snapshot is null or char_length(content_snapshot) between 1 and 500
  )
);

create index birthday_submission_events_participant_idx
  on public.birthday_wish_submission_events (club_id, participant_id, created_at desc, id desc);

comment on table public.birthday_wish_submission_events is
  'Append-only officer/member processing history for birthday collection submissions.';

alter table public.birthday_wish_submission_events enable row level security;
revoke all on table public.birthday_wish_submission_events from public, anon, authenticated;

create or replace function public.prevent_birthday_submission_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = '55000', message = 'birthday_submission_event_append_only';
end;
$$;

create trigger birthday_submission_events_append_only
before update or delete on public.birthday_wish_submission_events
for each row execute function public.prevent_birthday_submission_event_mutation();

create or replace function public.append_birthday_wish_submission_event(
  p_club_id uuid,
  p_participant_id uuid,
  p_submission_id uuid,
  p_event_type text,
  p_previous_status text,
  p_next_status text,
  p_content_snapshot text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  event_id uuid;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'birthday_submission_event_actor_required';
  end if;

  insert into public.birthday_wish_submission_events (
    club_id, participant_id, submission_id, event_type,
    previous_status, next_status, actor_app_account_id, content_snapshot
  ) values (
    p_club_id, p_participant_id, p_submission_id, p_event_type,
    p_previous_status, p_next_status, actor_id,
    case when p_content_snapshot is null then null else public.normalize_birthday_wish(p_content_snapshot) end
  ) returning id into event_id;

  return event_id;
end;
$$;

create or replace function public.protect_birthday_collection_submission()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.id is distinct from new.id
       or old.club_id is distinct from new.club_id
       or old.campaign_id is distinct from new.campaign_id
       or old.participant_id is distinct from new.participant_id
       or old.author_app_account_id is distinct from new.author_app_account_id
       or old.created_at is distinct from new.created_at
       or old.submitted_at is distinct from new.submitted_at
       or old.revision_number is distinct from new.revision_number then
      raise exception using errcode = '23514', message = 'birthday_submission_identity_immutable';
    end if;

    if old.submission_status = 'published' and new.submission_status = 'hidden' then
      if new.content is distinct from old.content
         or new.published_at is distinct from old.published_at
         or new.deleted_at is not null
         or new.hidden_at is null then
        raise exception using errcode = '23514', message = 'birthday_submission_hidden_payload_invalid';
      end if;
    elsif old.submission_status in ('published', 'hidden')
       and (
         new.submission_status <> old.submission_status
         or new.content is distinct from old.content
         or new.published_at is distinct from old.published_at
         or new.deleted_at is distinct from old.deleted_at
         or new.hidden_at is distinct from old.hidden_at
         or new.hidden_by_app_account_id is distinct from old.hidden_by_app_account_id
       ) then
      raise exception using errcode = '23514', message = 'birthday_submission_published_immutable';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- Hide a published blessing without deleting it. The old revision remains
-- visible to officers in the history and the author can submit a new revision.
create or replace function public.hide_birthday_wish_submission(
  p_club_id uuid,
  p_participant_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  submission_id uuid;
  submission_status text;
  submission_content text;
begin
  if actor_id is null
     or not public.current_can_manage_club(p_club_id)
     or not exists (
       select 1 from public.clubs where id = p_club_id and club_status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'birthday_collection_manager_required';
  end if;

  select submission.id, submission.submission_status, submission.content
  into submission_id, submission_status, submission_content
  from public.birthday_wish_campaign_submissions as submission
  where submission.club_id = p_club_id
    and submission.participant_id = p_participant_id
  order by submission.revision_number desc, submission.id desc
  limit 1
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'birthday_submission_not_found';
  end if;
  if submission_status = 'hidden' then
    return;
  end if;
  if submission_status <> 'published' then
    raise exception using errcode = '22023', message = 'birthday_submission_not_ready_for_hiding';
  end if;

  update public.birthday_wish_campaign_submissions
  set submission_status = 'hidden',
      hidden_at = now(),
      hidden_by_app_account_id = actor_id
  where id = submission_id and club_id = p_club_id;

  update public.birthday_wish_campaign_participants
  set participant_status = 'invited',
      responded_at = null
  where id = p_participant_id and club_id = p_club_id;

  perform public.append_birthday_wish_submission_event(
    p_club_id, p_participant_id, submission_id, 'hidden',
    'published', 'hidden', submission_content
  );
end;
$$;

-- A member may decline their one automatic invitation. It is recorded as a
-- response, so the monthly assignment quota is not silently re-used.
create or replace function public.decline_birthday_wish_assignment(
  p_club_id uuid,
  p_participant_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_membership_id uuid := public.current_birthday_membership_id(p_club_id);
  participant_status text;
  campaign_status text;
  latest_status text;
  latest_submission_id uuid;
begin
  if actor_membership_id is null then
    raise exception using errcode = '42501', message = 'active_birthday_membership_required';
  end if;

  select participant.participant_status, campaign.campaign_status
  into participant_status, campaign_status
  from public.birthday_wish_campaign_participants as participant
  join public.birthday_wish_campaigns as campaign
    on campaign.id = participant.campaign_id and campaign.club_id = participant.club_id
  where participant.id = p_participant_id
    and participant.club_id = p_club_id
    and participant.assignee_membership_id = actor_membership_id
  for update;

  if not found or participant_status in ('disabled', 'submitted') then
    raise exception using errcode = '42501', message = 'birthday_assignment_not_available';
  end if;
  if participant_status = 'declined' then
    return;
  end if;
  if campaign_status not in ('draft', 'collecting') then
    raise exception using errcode = '22023', message = 'birthday_campaign_submission_closed';
  end if;

  select submission.id, submission.submission_status
  into latest_submission_id, latest_status
  from public.birthday_wish_campaign_submissions as submission
  where submission.club_id = p_club_id and submission.participant_id = p_participant_id
  order by submission.revision_number desc, submission.id desc
  limit 1
  for update;

  if latest_status in ('submitted', 'published', 'hidden') then
    raise exception using errcode = '22023', message = 'birthday_assignment_already_started';
  end if;

  update public.birthday_wish_campaign_participants
  set participant_status = 'declined', responded_at = coalesce(responded_at, now())
  where id = p_participant_id and club_id = p_club_id;

  perform public.append_birthday_wish_submission_event(
    p_club_id, p_participant_id, latest_submission_id, 'declined',
    latest_status, 'declined', null
  );
end;
$$;

create or replace function public.save_birthday_wish_submission(
  p_club_id uuid,
  p_participant_id uuid,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_birthday_membership_id(p_club_id);
  campaign_status text;
  participant_status text;
  latest_status text;
  latest_submission_id uuid;
  latest_revision integer;
  latest_author_id uuid;
  submission_id uuid;
  event_type text;
  normalized_content text := public.normalize_birthday_wish(p_content);
begin
  if actor_id is null or actor_membership_id is null then
    raise exception using errcode = '42501', message = 'active_birthday_membership_required';
  end if;

  if normalized_content = '' or char_length(normalized_content) > 500 then
    raise exception using errcode = '22023', message = 'invalid_birthday_wish_content';
  end if;

  select participant.participant_status, campaign.campaign_status
  into participant_status, campaign_status
  from public.birthday_wish_campaign_participants as participant
  join public.birthday_wish_campaigns as campaign
    on campaign.id = participant.campaign_id
   and campaign.club_id = participant.club_id
  where participant.id = p_participant_id
    and participant.club_id = p_club_id
    and participant.assignee_membership_id = actor_membership_id
  for update;

  if not found or participant_status in ('disabled', 'declined') then
    raise exception using errcode = '42501', message = 'birthday_assignment_not_available';
  end if;

  select submission.id, submission.submission_status, submission.revision_number,
    submission.author_app_account_id
  into latest_submission_id, latest_status, latest_revision, latest_author_id
  from public.birthday_wish_campaign_submissions as submission
  where submission.participant_id = p_participant_id
    and submission.club_id = p_club_id
  order by submission.revision_number desc, submission.id desc
  limit 1
  for update;

  if latest_status = 'published' then
    raise exception using errcode = '23514', message = 'birthday_submission_published_immutable';
  end if;
  if latest_author_id is not null and latest_author_id <> actor_id then
    raise exception using errcode = '42501', message = 'birthday_submission_author_mismatch';
  end if;
  if campaign_status not in ('draft', 'collecting', 'published')
     or (campaign_status = 'published' and latest_status <> 'hidden') then
    raise exception using errcode = '22023', message = 'birthday_campaign_submission_closed';
  end if;

  if latest_status = 'hidden' then
    insert into public.birthday_wish_campaign_submissions (
      club_id, campaign_id, participant_id, author_app_account_id,
      content, revision_number
    )
    select participant.club_id, participant.campaign_id, participant.id,
      actor_id, normalized_content, latest_revision + 1
    from public.birthday_wish_campaign_participants as participant
    where participant.id = p_participant_id and participant.club_id = p_club_id
    returning id into submission_id;
    event_type := 'resubmitted';
  elsif latest_status = 'deleted' then
    update public.birthday_wish_campaign_submissions
    set content = normalized_content,
        submission_status = 'submitted',
        deleted_at = null
    where id = latest_submission_id and club_id = p_club_id
    returning id into submission_id;
    event_type := 'resubmitted';
  elsif latest_status = 'submitted' then
    update public.birthday_wish_campaign_submissions
    set content = normalized_content
    where id = latest_submission_id and club_id = p_club_id
    returning id into submission_id;
    event_type := 'updated';
  else
    insert into public.birthday_wish_campaign_submissions (
      club_id, campaign_id, participant_id, author_app_account_id, content, revision_number
    )
    select participant.club_id, participant.campaign_id, participant.id,
      actor_id, normalized_content, 1
    from public.birthday_wish_campaign_participants as participant
    where participant.id = p_participant_id and participant.club_id = p_club_id
    returning id into submission_id;
    event_type := 'submitted';
  end if;

  update public.birthday_wish_campaign_participants
  set participant_status = 'submitted',
      responded_at = coalesce(responded_at, now())
  where id = p_participant_id and club_id = p_club_id;

  perform public.append_birthday_wish_submission_event(
    p_club_id, p_participant_id, submission_id, event_type,
    latest_status, 'submitted', normalized_content
  );

  return submission_id;
end;
$$;

create or replace function public.delete_own_birthday_wish_submission(
  p_club_id uuid,
  p_participant_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_membership_id uuid := public.current_birthday_membership_id(p_club_id);
  existing_status text;
  existing_id uuid;
  existing_content text;
begin
  if actor_membership_id is null then
    raise exception using errcode = '42501', message = 'active_birthday_membership_required';
  end if;

  select submission.id, submission.submission_status, submission.content
  into existing_id, existing_status, existing_content
  from public.birthday_wish_campaign_submissions as submission
  join public.birthday_wish_campaign_participants as participant
    on participant.id = submission.participant_id
   and participant.club_id = submission.club_id
   and participant.assignee_membership_id = actor_membership_id
  where submission.participant_id = p_participant_id
    and submission.club_id = p_club_id
  order by submission.revision_number desc, submission.id desc
  limit 1
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'birthday_submission_not_found';
  end if;
  if existing_status in ('published', 'hidden') then
    raise exception using errcode = '23514', message = 'birthday_submission_published_immutable';
  end if;
  if existing_status = 'deleted' then
    return;
  end if;

  update public.birthday_wish_campaign_submissions
  set submission_status = 'deleted', deleted_at = coalesce(deleted_at, now())
  where id = existing_id and club_id = p_club_id;

  update public.birthday_wish_campaign_participants
  set participant_status = 'invited', responded_at = null
  where id = p_participant_id and club_id = p_club_id;

  perform public.append_birthday_wish_submission_event(
    p_club_id, p_participant_id, existing_id, 'deleted',
    existing_status, 'deleted', existing_content
  );
end;
$$;

create or replace function public.get_my_birthday_wish_collection_page(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid;
  can_manage boolean := false;
  result jsonb;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'birthday_authentication_required';
  end if;

  if p_club_id is null or not public.current_can_access_birthday_club(p_club_id) then
    raise exception using errcode = '42501', message = 'birthday_club_access_required';
  end if;

  actor_membership_id := public.current_birthday_membership_id(p_club_id);
  can_manage := public.current_can_manage_club(p_club_id);

  select jsonb_build_object(
    'club_id', p_club_id,
    'can_manage', can_manage,
    'my_assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'participant_id', participant.id,
        'campaign_id', participant.campaign_id,
        'recipient_membership_id', campaign.recipient_membership_id,
        'recipient_name', recipient.canonical_name,
        'birthday_date', campaign.birthday_date,
        'participant_status', participant.participant_status,
        'question_prompt', participant.question_prompt_snapshot,
        'submission_id', submission.id,
        'submission_status', submission.submission_status,
        'content', case
          when submission.submission_status in ('deleted', 'hidden') then null
          else submission.content
        end,
        'submitted_at', submission.submitted_at,
        'can_edit', participant.participant_status not in ('declined', 'disabled')
          and (submission.id is null or submission.submission_status <> 'published'),
        'can_decline', participant.participant_status = 'invited'
          and campaign.campaign_status in ('draft', 'collecting')
          and (submission.id is null or submission.submission_status = 'deleted')
      ) order by campaign.birthday_date, participant.id)
      from public.birthday_wish_campaign_participants as participant
      join public.birthday_wish_campaigns as campaign
        on campaign.id = participant.campaign_id
       and campaign.club_id = participant.club_id
      join public.club_memberships as recipient_membership
        on recipient_membership.id = campaign.recipient_membership_id
       and recipient_membership.club_id = p_club_id
      join public.people as recipient on recipient.id = recipient_membership.person_id
      left join lateral (
        select submission.id, submission.submission_status, submission.content,
          submission.submitted_at
        from public.birthday_wish_campaign_submissions as submission
        where submission.participant_id = participant.id
          and submission.club_id = participant.club_id
        order by submission.revision_number desc, submission.id desc
        limit 1
      ) as submission on true
      where participant.club_id = p_club_id
        and participant.assignee_membership_id = actor_membership_id
        and campaign.campaign_status in ('draft', 'collecting', 'published')
    ), '[]'::jsonb),
    'campaigns', case when can_manage then coalesce((
      select jsonb_agg(jsonb_build_object(
        'campaign_id', campaign.id,
        'recipient_membership_id', campaign.recipient_membership_id,
        'recipient_name', recipient.canonical_name,
        'birthday_year', campaign.birthday_year,
        'birthday_date', campaign.birthday_date,
        'campaign_status', campaign.campaign_status,
        'participant_count', (
          select count(*)::integer
          from public.birthday_wish_campaign_participants as participant
          where participant.campaign_id = campaign.id
            and participant.club_id = p_club_id
        ),
        'submitted_count', (
          select count(*)::integer
          from public.birthday_wish_campaign_participants as participant
          left join lateral (
            select submission.submission_status
            from public.birthday_wish_campaign_submissions as submission
            where submission.participant_id = participant.id
              and submission.club_id = participant.club_id
            order by submission.revision_number desc, submission.id desc
            limit 1
          ) as latest on true
          where participant.campaign_id = campaign.id
            and participant.club_id = p_club_id
            and latest.submission_status in ('submitted', 'published')
        )
      ) order by campaign.birthday_date, campaign.id)
      from public.birthday_wish_campaigns as campaign
      join public.club_memberships as recipient_membership
        on recipient_membership.id = campaign.recipient_membership_id
       and recipient_membership.club_id = p_club_id
      join public.people as recipient on recipient.id = recipient_membership.person_id
      where campaign.club_id = p_club_id
        and campaign.campaign_status <> 'hidden'
    ), '[]'::jsonb) else '[]'::jsonb end,
    'participants', case when can_manage then coalesce((
      select jsonb_agg(jsonb_build_object(
        'participant_id', participant.id,
        'campaign_id', participant.campaign_id,
        'assignee_membership_id', participant.assignee_membership_id,
        'assignee_name', assignee.canonical_name,
        'participant_status', participant.participant_status,
        'question_prompt', participant.question_prompt_snapshot,
        'submission_status', submission.submission_status,
        'author_name', author.account_display_name,
        'content', case when submission.submission_status = 'deleted' then null else submission.content end,
        'submitted_at', submission.submitted_at,
        'processing_history', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', event.id,
            'event_type', event.event_type,
            'previous_status', event.previous_status,
            'next_status', event.next_status,
            'actor_name', event_actor.account_display_name,
            'content_snapshot', event.content_snapshot,
            'created_at', event.created_at
          ) order by event.created_at desc, event.id desc)
          from public.birthday_wish_submission_events as event
          join public.app_accounts as event_actor on event_actor.id = event.actor_app_account_id
          where event.club_id = p_club_id and event.participant_id = participant.id
        ), '[]'::jsonb)
      ) order by campaign.birthday_date, participant.id)
      from public.birthday_wish_campaign_participants as participant
      join public.birthday_wish_campaigns as campaign
        on campaign.id = participant.campaign_id
       and campaign.club_id = participant.club_id
      join public.club_memberships as assignee_membership
        on assignee_membership.id = participant.assignee_membership_id
       and assignee_membership.club_id = p_club_id
      join public.people as assignee on assignee.id = assignee_membership.person_id
      left join lateral (
        select submission.id, submission.submission_status, submission.content,
          submission.submitted_at, submission.author_app_account_id
        from public.birthday_wish_campaign_submissions as submission
        where submission.participant_id = participant.id
          and submission.club_id = participant.club_id
        order by submission.revision_number desc, submission.id desc
        limit 1
      ) as submission on true
      left join public.app_accounts as author on author.id = submission.author_app_account_id
      where participant.club_id = p_club_id
        and campaign.campaign_status <> 'hidden'
    ), '[]'::jsonb) else '[]'::jsonb end,
    'question_bank', case when can_manage
      then public.list_birthday_wish_question_bank(p_club_id)
      else jsonb_build_object('platform', '[]'::jsonb, 'club', '[]'::jsonb)
    end
  ) into result;

  return result;
end;
$$;

create or replace function public.publish_birthday_wish_submission(
  p_club_id uuid,
  p_participant_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  submission_id uuid;
  submission_status text;
  submission_content text;
  campaign_status text;
  target_campaign_id uuid;
begin
  if actor_id is null
     or not public.current_can_manage_club(p_club_id)
     or not exists (
       select 1 from public.clubs
       where id = p_club_id and club_status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'birthday_collection_manager_required';
  end if;

  select submission.id, submission.submission_status, submission.content,
    submission.campaign_id, campaign.campaign_status
  into submission_id, submission_status, submission_content,
    target_campaign_id, campaign_status
  from public.birthday_wish_campaign_submissions as submission
  join public.birthday_wish_campaigns as campaign
    on campaign.id = submission.campaign_id and campaign.club_id = submission.club_id
  where submission.participant_id = p_participant_id
    and submission.club_id = p_club_id
  order by submission.revision_number desc, submission.id desc
  limit 1
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'birthday_submission_not_found';
  end if;
  if submission_status = 'published' then
    return;
  end if;
  if submission_status <> 'submitted' then
    raise exception using errcode = '22023', message = 'birthday_submission_not_ready_for_publication';
  end if;
  if campaign_status not in ('draft', 'collecting', 'published') then
    raise exception using errcode = '22023', message = 'birthday_campaign_submission_closed';
  end if;

  update public.birthday_wish_campaign_submissions
  set submission_status = 'published',
      published_at = coalesce(published_at, now()),
      deleted_at = null
  where id = submission_id and club_id = p_club_id;

  update public.birthday_wish_campaign_participants
  set participant_status = 'submitted',
      responded_at = coalesce(responded_at, now())
  where id = p_participant_id and club_id = p_club_id;

  perform public.append_birthday_wish_submission_event(
    p_club_id, p_participant_id, submission_id, 'published',
    'submitted', 'published', submission_content
  );

  -- A campaign is complete only when every non-declined/non-disabled member
  -- has a published current revision. A hidden revision deliberately keeps it
  -- open for a correction.
  if not exists (
    select 1
    from public.birthday_wish_campaign_participants as participant
    left join lateral (
      select submission.submission_status
      from public.birthday_wish_campaign_submissions as submission
      where submission.participant_id = participant.id
        and submission.club_id = participant.club_id
      order by submission.revision_number desc, submission.id desc
      limit 1
    ) as latest on true
    where participant.campaign_id = target_campaign_id
      and participant.club_id = p_club_id
      and participant.participant_status not in ('declined', 'disabled')
      and (latest.submission_status is null or latest.submission_status <> 'published')
  ) then
    update public.birthday_wish_campaigns
    set campaign_status = 'published',
        published_at = coalesce(published_at, now())
    where id = target_campaign_id and club_id = p_club_id;
  end if;
end;
$$;

revoke all on function public.hide_birthday_wish_submission(uuid, uuid) from public, anon;
revoke all on function public.decline_birthday_wish_assignment(uuid, uuid) from public, anon;
revoke all on function public.append_birthday_wish_submission_event(uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.hide_birthday_wish_submission(uuid, uuid) to authenticated;
grant execute on function public.decline_birthday_wish_assignment(uuid, uuid) to authenticated;

create or replace function public.ensure_birthday_wish_collection_notification(
  p_club_id uuid,
  p_assignment_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  batch_status text;
  notification_status text;
  existing_message_id uuid;
  notification_message_id uuid;
  participant_count integer;
  delivered_count integer;
  error_code text;
  action text := format('/birthday-collection?clubId=%s', p_club_id);
begin
  if actor_id is null
     or not public.current_can_manage_club(p_club_id)
     or not exists (
       select 1 from public.clubs
       where id = p_club_id and club_status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'birthday_collection_manager_required';
  end if;

  select batch.batch_status into batch_status
  from public.birthday_wish_assignment_batches as batch
  where batch.id = p_assignment_batch_id and batch.club_id = p_club_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'birthday_assignment_batch_not_found';
  end if;
  if batch_status <> 'completed' then
    raise exception using errcode = '22023', message = 'birthday_assignment_batch_not_complete';
  end if;

  select count(*)::integer into participant_count
  from public.birthday_wish_campaign_participants as participant
  where participant.club_id = p_club_id
    and participant.assignment_batch_id = p_assignment_batch_id
    and participant.participant_status <> 'disabled';

  if participant_count = 0 then
    return jsonb_build_object('status', 'no_recipients', 'batch_id', p_assignment_batch_id);
  end if;

  insert into public.birthday_wish_collection_notifications (club_id, assignment_batch_id)
  values (p_club_id, p_assignment_batch_id)
  on conflict (club_id, assignment_batch_id) do nothing;

  select notification.notification_status, notification.message_id
  into notification_status, existing_message_id
  from public.birthday_wish_collection_notifications as notification
  where notification.club_id = p_club_id
    and notification.assignment_batch_id = p_assignment_batch_id
  for update;

  if notification_status = 'sent' and existing_message_id is not null then
    return jsonb_build_object(
      'status', 'sent', 'batch_id', p_assignment_batch_id,
      'message_id', existing_message_id, 'recipient_count', participant_count
    );
  end if;

  if not exists (
    select 1 from public.platform_feature_flags as flag
    where flag.feature_key = 'announcements_v09'
      and flag.enabled = true and flag.rollout_percentage = 100
  ) then
    update public.birthday_wish_collection_notifications
    set notification_status = 'skipped', failure_reason = 'message_center_disabled'
    where club_id = p_club_id and assignment_batch_id = p_assignment_batch_id;
    return jsonb_build_object(
      'status', 'skipped', 'batch_id', p_assignment_batch_id,
      'reason', 'message_center_disabled'
    );
  end if;

  update public.birthday_wish_collection_notifications
  set notification_status = 'pending', attempt_count = attempt_count + 1,
      last_attempt_at = now(), failure_reason = null
  where club_id = p_club_id and assignment_batch_id = p_assignment_batch_id;

  begin
    insert into public.club_messages (
      club_id, author_app_account_id, title, body, audience_kind, action_path
    ) values (
      p_club_id, actor_id, '本月生日祝福任務',
      '您有一則生日祝福任務，請打開生日祝福徵集完成它。',
      'members', action
    ) returning id into notification_message_id;

    insert into public.club_message_recipients (
      message_id, membership_id, club_id, birthday_participant_id
    )
    select notification_message_id, participant.assignee_membership_id,
      p_club_id, participant.id
    from public.birthday_wish_campaign_participants as participant
    where participant.club_id = p_club_id
      and participant.assignment_batch_id = p_assignment_batch_id
      and participant.participant_status <> 'disabled';
    get diagnostics delivered_count = row_count;

    if delivered_count <> participant_count then
      raise exception using errcode = '23514', message = 'birthday_notification_recipient_mismatch';
    end if;

    update public.birthday_wish_collection_notifications
    set notification_status = 'sent', message_id = notification_message_id,
        sent_at = now(), failure_reason = null
    where club_id = p_club_id and assignment_batch_id = p_assignment_batch_id;
  exception when others then
    get stacked diagnostics error_code = returned_sqlstate;
    update public.birthday_wish_collection_notifications
    set notification_status = 'failed',
        failure_reason = format('message_delivery_failed_%s', lower(error_code))
    where club_id = p_club_id and assignment_batch_id = p_assignment_batch_id;
    return jsonb_build_object(
      'status', 'failed', 'batch_id', p_assignment_batch_id,
      'reason', 'message_delivery_failed'
    );
  end;

  return jsonb_build_object(
    'status', 'sent', 'batch_id', p_assignment_batch_id,
    'message_id', notification_message_id, 'recipient_count', delivered_count
  );
end;
$$;

-- Each member sees the state of the birthday assignment linked to their own
-- inbox row. Generic messages keep a NULL action status.
create or replace function public.list_my_club_messages(
  p_club_id uuid,
  p_cursor_published_at timestamptz default null,
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
  my_membership_id uuid := public.current_club_membership_id(p_club_id);
  result jsonb;
begin
  if not public.current_is_active_club_member(p_club_id) or my_membership_id is null then
    raise exception using errcode = '42501', message = 'active_club_membership_required';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using errcode = '22023', message = 'invalid_message_limit';
  end if;

  if (p_cursor_published_at is null) <> (p_cursor_id is null) then
    raise exception using errcode = '22023', message = 'invalid_message_cursor';
  end if;

  with page as materialized (
    select message.id, message.title, message.body, message.audience_kind,
      message.action_path, message.published_at, recipient.read_at,
      account.account_display_name as author_display_name,
      case
        when birthday_assignment.participant_status = 'declined' then 'declined'
        when birthday_assignment.participant_status = 'disabled' then 'disabled'
        when birthday_assignment.submission_status = 'hidden' then 'needs_resubmission'
        when birthday_assignment.submission_status in ('submitted', 'published') then 'completed'
        when birthday_assignment.participant_status is not null then 'pending'
        else null
      end as action_status
    from public.club_message_recipients as recipient
    join public.club_messages as message on message.id = recipient.message_id
    join public.app_accounts as account on account.id = message.author_app_account_id
    left join lateral (
      select participant.participant_status, latest.submission_status
      from public.birthday_wish_campaign_participants as participant
      left join lateral (
        select submission.submission_status
        from public.birthday_wish_campaign_submissions as submission
        where submission.participant_id = participant.id
          and submission.club_id = participant.club_id
        order by submission.revision_number desc, submission.id desc
        limit 1
      ) as latest on true
      where participant.id = recipient.birthday_participant_id
        and participant.club_id = p_club_id
        and participant.assignee_membership_id = my_membership_id
      limit 1
    ) as birthday_assignment on true
    where recipient.club_id = p_club_id
      and recipient.membership_id = my_membership_id
      and message.status = 'active'
      and (
        p_cursor_published_at is null
        or message.published_at < p_cursor_published_at
        or (message.published_at = p_cursor_published_at and message.id < p_cursor_id)
      )
    order by message.published_at desc, message.id desc
    limit p_limit + 1
  ), visible as materialized (
    select * from page
    order by published_at desc, id desc
    limit p_limit
  )
  select jsonb_build_object(
    'messages', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', visible.id,
          'title', visible.title,
          'body', visible.body,
          'audience_kind', visible.audience_kind,
          'action_path', visible.action_path,
          'action_status', visible.action_status,
          'published_at', visible.published_at,
          'author_display_name', visible.author_display_name,
          'read_at', visible.read_at
        ) order by visible.published_at desc, visible.id desc
      )
      from visible
    ), '[]'::jsonb),
    'unread_count', public.my_unread_club_message_count(p_club_id),
    'next_cursor', case
      when (select count(*) from page) > p_limit then (
        select jsonb_build_object('v', 1, 'published_at', visible.published_at, 'id', visible.id)
        from visible
        order by visible.published_at asc, visible.id asc
        limit 1
      )
      else null
    end
  ) into result;

  return result;
end;
$$;

revoke all on function public.list_my_club_messages(uuid, timestamptz, uuid, integer) from public, anon;
grant execute on function public.list_my_club_messages(uuid, timestamptz, uuid, integer) to authenticated;

commit;

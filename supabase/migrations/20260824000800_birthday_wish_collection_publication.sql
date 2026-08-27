begin;

-- Publication is a manager decision. Keep it separate from the member
-- submission RPC so the browser cannot publish its own content by changing a
-- form value, and keep the published projection separate so author anonymity
-- is enforced by the database rather than by the React page.
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
  submission_status text;
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

  select submission.submission_status, submission.campaign_id, campaign.campaign_status
  into submission_status, target_campaign_id, campaign_status
  from public.birthday_wish_campaign_submissions as submission
  join public.birthday_wish_campaigns as campaign
    on campaign.id = submission.campaign_id
   and campaign.club_id = submission.club_id
  where submission.participant_id = p_participant_id
    and submission.club_id = p_club_id
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

  if campaign_status not in ('draft', 'collecting') then
    raise exception using errcode = '22023', message = 'birthday_campaign_submission_closed';
  end if;

  update public.birthday_wish_campaign_submissions
  set submission_status = 'published',
      published_at = coalesce(published_at, now()),
      deleted_at = null
  where participant_id = p_participant_id
    and club_id = p_club_id;

  -- A campaign becomes published only after every assigned task has reached a
  -- terminal review state. Unsubmitted members can therefore still complete
  -- their task while already-reviewed blessings are visible.
  if not exists (
    select 1
    from public.birthday_wish_campaign_participants as participant
    left join public.birthday_wish_campaign_submissions as submission
      on submission.participant_id = participant.id
     and submission.club_id = participant.club_id
    where participant.campaign_id = target_campaign_id
      and participant.club_id = p_club_id
      and (
        submission.id is null
        or submission.submission_status not in ('published', 'hidden', 'deleted')
      )
  ) then
    update public.birthday_wish_campaigns
    set campaign_status = 'published',
        published_at = coalesce(published_at, now())
    where id = target_campaign_id and club_id = p_club_id;
  end if;
end;
$$;

-- This projection is the only public-facing read for collection submissions.
-- A manager or the author may see the author name; the birthday member and
-- every other member receive a null author_name from the database.
create or replace function public.list_published_birthday_wish_submissions(
  p_club_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  can_manage boolean := false;
  result jsonb;
begin
  if actor_id is null or not public.current_can_access_birthday_club(p_club_id) then
    raise exception using errcode = '42501', message = 'birthday_club_access_required';
  end if;

  can_manage := public.current_can_manage_club(p_club_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'submission_id', submission.id,
    'campaign_id', campaign.id,
    'recipient_membership_id', campaign.recipient_membership_id,
    'recipient_name', recipient.canonical_name,
    'birthday_date', campaign.birthday_date,
    'content', submission.content,
    'published_at', submission.published_at,
    'author_name', case
      when can_manage or submission.author_app_account_id = actor_id
        then author.account_display_name
      else null
    end,
    'author_is_hidden', not (can_manage or submission.author_app_account_id = actor_id)
  ) order by campaign.birthday_date, submission.published_at, submission.id), '[]'::jsonb)
  into result
  from public.birthday_wish_campaign_submissions as submission
  join public.birthday_wish_campaigns as campaign
    on campaign.id = submission.campaign_id
   and campaign.club_id = submission.club_id
  join public.club_memberships as recipient_membership
    on recipient_membership.id = campaign.recipient_membership_id
   and recipient_membership.club_id = p_club_id
   and recipient_membership.membership_status = 'active'
  join public.people as recipient on recipient.id = recipient_membership.person_id
  join public.birthday_visibility_preferences as preference
    on preference.membership_id = recipient_membership.id
   and preference.club_id = p_club_id
   and preference.is_listed = true
   and preference.allow_wishes = true
  join public.app_accounts as author on author.id = submission.author_app_account_id
  where submission.club_id = p_club_id
    and submission.submission_status = 'published'
    and campaign.campaign_status <> 'hidden';

  return result;
end;
$$;

revoke all on function public.publish_birthday_wish_submission(uuid, uuid) from public, anon;
revoke all on function public.list_published_birthday_wish_submissions(uuid) from public, anon;
grant execute on function public.publish_birthday_wish_submission(uuid, uuid) to authenticated;
grant execute on function public.list_published_birthday_wish_submissions(uuid) to authenticated;

commit;

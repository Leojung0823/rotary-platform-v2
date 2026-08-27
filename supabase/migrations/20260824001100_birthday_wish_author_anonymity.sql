begin;

-- Published birthday wishes are anonymous to every non-manager, including the
-- member who wrote the blessing. Only a club manager may see the author name.
-- Keep this projection database-enforced so the page cannot accidentally
-- reveal the author through a new member UI.
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
      when can_manage then author.account_display_name
      else null
    end,
    'author_is_hidden', not can_manage
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

revoke all on function public.list_published_birthday_wish_submissions(uuid) from public, anon;
grant execute on function public.list_published_birthday_wish_submissions(uuid) to authenticated;

commit;

begin;

-- 已經建立的生日徵集任務要能改日期、也要能收掉。
--
-- create_birthday_wish_campaign has existed since the module shipped and
-- nothing has ever been able to undo it. An officer who ran the month with the
-- wrong date, or for someone who has since left, had a task on the page for
-- good -- and the members assigned to it kept being reminded about it.
--
-- The schema already anticipated the end of a campaign: campaign_status allows
-- 'closed' and 'hidden', and list_published_birthday_wish_submissions already
-- excludes 'hidden'. Nothing ever set either.

create or replace function public.close_birthday_wish_campaign(
  p_club_id uuid,
  p_campaign_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.birthday_wish_campaigns;
  normalized_reason text := btrim(coalesce(p_reason, ''));
  next_status text;
begin
  if actor_id is null
     or not public.current_can_manage_birthday_collection(p_club_id) then
    raise exception using errcode = '42501', message = 'birthday_collection_manager_required';
  end if;
  -- Ending something other people were asked to write for is a decision the
  -- club should be able to answer for later.
  if normalized_reason = '' or char_length(normalized_reason) > 200 then
    raise exception using errcode = '22023', message = 'campaign_close_reason_required';
  end if;

  select * into target from public.birthday_wish_campaigns
  where id = p_campaign_id and club_id = p_club_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'campaign_not_available';
  end if;

  -- Two different endings, because they undo two different things.
  --
  --   draft/collecting -- nobody has been shown the result yet, so the task
  --     simply stops. 'closed'.
  --   published -- the recipient has already seen it. Taking it back is not
  --     the same act, and it is the one 'hidden' exists for:
  --     list_published_birthday_wish_submissions already excludes it.
  --
  -- Anything already ended stays as it is rather than being re-ended.
  next_status := case target.campaign_status
    when 'draft' then 'closed'
    when 'collecting' then 'closed'
    when 'published' then 'hidden'
    else null
  end;
  if next_status is null then
    raise exception using errcode = '22023', message = 'campaign_already_ended';
  end if;

  update public.birthday_wish_campaigns
  set campaign_status = next_status,
      closed_at = coalesce(closed_at, now()),
      updated_at = now()
  where id = target.id;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'birthday_campaign.closed', 'birthday_wish_campaign', target.id,
    jsonb_build_object(
      'from_status', target.campaign_status,
      'to_status', next_status,
      'reason', normalized_reason
    )
  );

  return jsonb_build_object('campaign_id', target.id, 'campaign_status', next_status);
end;
$$;

create or replace function public.update_birthday_wish_campaign_date(
  p_club_id uuid,
  p_campaign_id uuid,
  p_birthday_date date
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.birthday_wish_campaigns;
begin
  if actor_id is null
     or not public.current_can_manage_birthday_collection(p_club_id) then
    raise exception using errcode = '42501', message = 'birthday_collection_manager_required';
  end if;
  if p_birthday_date is null then
    raise exception using errcode = '22023', message = 'invalid_campaign_date';
  end if;

  select * into target from public.birthday_wish_campaigns
  where id = p_campaign_id and club_id = p_club_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'campaign_not_available';
  end if;

  -- Only while it is still being written. Once the recipient has seen the
  -- result, the date it was collected for is part of what they saw.
  if target.campaign_status not in ('draft', 'collecting') then
    raise exception using errcode = '22023', message = 'campaign_already_ended';
  end if;
  -- The table's own constraint says the date must fall in birthday_year; the
  -- year itself is the identity of the campaign (one per member per year) and
  -- so is not editable here.
  if extract(year from p_birthday_date)::integer <> target.birthday_year then
    raise exception using errcode = '22023', message = 'invalid_campaign_date';
  end if;

  update public.birthday_wish_campaigns
  set birthday_date = p_birthday_date,
      updated_at = now()
  where id = target.id;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'birthday_campaign.date_updated', 'birthday_wish_campaign', target.id,
    jsonb_build_object('from_date', target.birthday_date, 'to_date', p_birthday_date)
  );

  return jsonb_build_object('campaign_id', target.id, 'birthday_date', p_birthday_date);
end;
$$;

revoke all on function public.close_birthday_wish_campaign(uuid, uuid, text) from public, anon;
revoke all on function public.update_birthday_wish_campaign_date(uuid, uuid, date) from public, anon;
grant execute on function public.close_birthday_wish_campaign(uuid, uuid, text) to authenticated;
grant execute on function public.update_birthday_wish_campaign_date(uuid, uuid, date) to authenticated;

commit;

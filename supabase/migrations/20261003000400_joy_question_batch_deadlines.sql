begin;

alter table public.joy_question_batches
  add column due_on date;

-- Keep the established four-argument dispatcher and its idempotency contract
-- untouched. This wrapper adds a date-only deadline, checks it against the
-- Taiwan calendar, and rolls the whole transaction back when a new batch is
-- submitted with a date that has already passed.
create function public.dispatch_joy_question_batch_with_deadline(
  p_club_id uuid,
  p_title text,
  p_recipient_membership_ids uuid[],
  p_request_id uuid,
  p_due_on date
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  dispatch_result jsonb;
  batch public.joy_question_batches;
  is_replay boolean;
begin
  dispatch_result := public.dispatch_joy_question_batch(
    p_club_id, p_title, p_recipient_membership_ids, p_request_id
  );

  select * into strict batch
  from public.joy_question_batches as existing
  where existing.id = (dispatch_result->>'id')::uuid
    and existing.club_id = p_club_id
  for update;

  is_replay := coalesce((dispatch_result->>'replayed')::boolean, false);
  if is_replay then
    if batch.due_on is distinct from p_due_on then
      raise exception using errcode = '22023', message = 'joy_question_batch_idempotency_conflict';
    end if;
  else
    if p_due_on is not null
      and p_due_on < (pg_catalog.statement_timestamp() at time zone 'Asia/Taipei')::date then
      raise exception using errcode = '22023', message = 'invalid_joy_question_batch_due_on';
    end if;

    update public.joy_question_batches
    set due_on = p_due_on
    where id = batch.id and club_id = p_club_id
    returning * into batch;

    update public.joy_wall_audit_events
    set details = details || jsonb_build_object('due_on', p_due_on)
    where club_id = p_club_id
      and object_kind = 'question_batch'
      and object_id = batch.id
      and event_type = 'question_batch_dispatched';
  end if;

  return dispatch_result || jsonb_build_object('due_on', batch.due_on);
end;
$$;

revoke all on function public.dispatch_joy_question_batch_with_deadline(uuid, text, uuid[], uuid, date)
  from public, anon;
grant execute on function public.dispatch_joy_question_batch_with_deadline(uuid, text, uuid[], uuid, date)
  to authenticated;

commit;

begin;

-- A question-bank shortage is recoverable after an officer adds or re-enables
-- prompts. Other terminal states remain immutable. The assignment runner's
-- existing failed -> assigning update is converted to a fresh planned run so
-- its idempotency boundary and all existing campaign/participant checks stay
-- in one function.
create or replace function public.protect_birthday_collection_batch()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.id is distinct from new.id
       or old.club_id is distinct from new.club_id
       or old.birthday_year is distinct from new.birthday_year
       or old.birthday_month is distinct from new.birthday_month
       or old.created_by_app_account_id is distinct from new.created_by_app_account_id
       or old.created_at is distinct from new.created_at then
      raise exception using errcode = '23514', message = 'birthday_assignment_batch_identity_immutable';
    end if;

    if old.batch_status = 'completed'
       and new.batch_status <> old.batch_status then
      raise exception using errcode = '23514', message = 'birthday_assignment_batch_terminal';
    end if;

    if old.batch_status = 'failed'
       and new.batch_status <> old.batch_status then
      if old.failure_reason <> 'birthday_question_bank_exhausted'
         or new.batch_status <> 'assigning' then
        raise exception using errcode = '23514', message = 'birthday_assignment_batch_terminal';
      end if;
      new.batch_status := 'planned';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

commit;

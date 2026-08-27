begin;

-- Question ids are not enough to guarantee distinct prompts: a club may add a
-- custom item whose wording matches a platform item. Enforce the product rule
-- at the assignment snapshot boundary so direct RPC calls and the scheduler
-- have the same protection.
create unique index birthday_participant_batch_prompt_unique
  on public.birthday_wish_campaign_participants (
    assignment_batch_id,
    club_id,
    lower(btrim(question_prompt_snapshot))
  );

comment on index public.birthday_participant_batch_prompt_unique is
  'One normalized question prompt per club and birthday assignment batch.';

commit;

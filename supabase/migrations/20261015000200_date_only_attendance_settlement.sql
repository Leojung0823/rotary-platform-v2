begin;

-- A date-only meeting remains unsettled throughout its Taipei-local date.
-- Its stored starts_at is the beginning of that date only to provide a
-- half-open date boundary; it must never be mistaken for an actual start time.
do $$
declare
  definition text;
  old_final_status constant text := $replace$      when adjustment.adjustment_type = 'exempt' then 'exempt'
      else 'absent'$replace$;
  new_final_status constant text := $replace$      when adjustment.adjustment_type = 'exempt' then 'exempt'
      when event.time_unspecified and event.ends_at > now() then 'pending'
      else 'absent'$replace$;
  old_denominator_cutoff constant text := $replace$      and event.starts_at <= now()$replace$;
  new_denominator_cutoff constant text := $replace$      and case when event.time_unspecified
        then event.ends_at <= now()
        else event.starts_at <= now()
      end$replace$;
  occurrences integer;
begin
  definition := pg_get_functiondef('public.attendance_result_for_member(uuid,uuid)'::regprocedure);
  occurrences := (length(definition) - length(replace(definition, old_final_status, ''))) / length(old_final_status);
  if occurrences <> 1 then raise exception 'attendance_result_for_member status fragment mismatch'; end if;
  definition := replace(definition, old_final_status, new_final_status);

  occurrences := (length(definition) - length(replace(definition, old_denominator_cutoff, ''))) / length(old_denominator_cutoff);
  if occurrences <> 1 then raise exception 'attendance_result_for_member cutoff fragment mismatch'; end if;
  definition := replace(definition, old_denominator_cutoff, new_denominator_cutoff);
  execute definition;
end;
$$;

-- Personal and club summaries, plus member history, exclude a date-only
-- meeting until the local day has ended. A manager can still open its roster
-- during the day and record a manual attendance adjustment if needed.
do $$
declare
  definition text;
  old_cutoff constant text := $replace$      and event.starts_at <= now()$replace$;
  new_cutoff constant text := $replace$      and case when event.time_unspecified
        then event.ends_at <= now()
        else event.starts_at <= now()
      end$replace$;
  target_signature text;
  occurrences integer;
begin
  for target_signature in
    select signature from (values
      ('public.list_my_attendance_history(uuid,date,date)'),
      ('public.get_my_attendance_summary(uuid,date,date)'),
      ('public.get_club_attendance_summary(uuid,date,date)')
    ) as targets(signature)
  loop
    definition := pg_get_functiondef(target_signature::regprocedure);
    occurrences := (length(definition) - length(replace(definition, old_cutoff, ''))) / length(old_cutoff);
    if occurrences <> 1 then raise exception 'attendance settlement cutoff mismatch for %', target_signature; end if;
    execute replace(definition, old_cutoff, new_cutoff);
  end loop;
end;
$$;

-- Keep the attendance-management roster honest: before day-end, members with
-- no check-in are "pending", not "absent". Preserve the real date-only bit so
-- the page can show a date instead of the synthetic midnight boundary.
do $$
declare
  definition text;
  old_roster_event constant text := $replace$      'starts_at', event.starts_at,
      'status', event.event_status,$replace$;
  new_roster_event constant text := $replace$      'starts_at', event.starts_at,
      'time_unspecified', event.time_unspecified,
      'status', event.event_status,$replace$;
begin
  definition := pg_get_functiondef('public.get_event_attendance_roster(uuid,uuid)'::regprocedure);
  if (length(definition) - length(replace(definition, old_roster_event, ''))) / length(old_roster_event) <> 1 then
    raise exception 'get_event_attendance_roster event projection mismatch';
  end if;
  execute replace(definition, old_roster_event, new_roster_event);
end;
$$;

commit;

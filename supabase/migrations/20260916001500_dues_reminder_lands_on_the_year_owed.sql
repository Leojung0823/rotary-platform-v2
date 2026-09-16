begin;

-- 兩件事，都是把「提醒指過去的那一頁，真的做得到嗎」再往下問一層問出來的。
--
-- 一、社費未繳說得出金額，卻送到一個看不到那筆金額的頁面。
--
-- 提醒刻意算的是「所有年度」——去年沒繳清，今年還是欠著。而 /dues 一次只
-- 看一個年度，預設落在最新的那一年。所以欠去年社費的社友，首頁說「社費
-- 未繳 · TWD 3000」，點進去看到的是今年、已繳清，而且沒有任何東西告訴他
-- 該去點哪一年。
--
-- 現在每一列帶著自己的年度：連結直接落在那一年，detail 也把年度寫在金額
-- 前面 —— 欠好幾年的人會拿到好幾列，而「TWD 3000」重複三次說不出任何事。
--
-- 二、生日指派的分類規則還有第三份。
--
-- #185 把 get_my_member_home_projection 裡的兩份收成 birthday_wish_action_status，
-- 但 list_my_club_messages 自己也抄了一份一模一樣的 case。當時那條守則只掃
-- 那一支函式 —— 範圍比它宣稱的主張窄，所以第三份沒有被看見。
--
-- 這支把第三份也收掉；守則改成掃整個 schema。

create or replace function public.get_my_member_home_projection(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid;
  active_membership_id uuid;
  target_club_code text;
  target_club_name text;
  result jsonb;
begin
  select account.id, membership.id, club.club_code, club.club_name
    into actor_id, active_membership_id, target_club_code, target_club_name
  from public.app_accounts as account
  join public.club_memberships as membership on membership.person_id = account.person_id
  join public.clubs as club on club.id = membership.club_id
  where account.auth_user_id = auth.uid()
    and account.account_status = 'active'
    and membership.club_id = p_club_id
    and membership.membership_status = 'active'
    and club.club_status = 'active';

  if actor_id is null or active_membership_id is null then
    raise exception using errcode = '42501', message = 'active_member_home_required';
  end if;

  with candidate_events as (
    select
      event.id,
      event.event_type,
      event.title,
      event.location,
      event.starts_at,
      event.ends_at,
      event.registration_deadline,
      event.counts_for_attendance,
      event.cover_image_path,
      registration.response as my_response,
      session.session_status as checkin_session_status,
      session.opens_at as checkin_opens_at,
      session.expires_at as checkin_expires_at,
      exists (
        select 1
        from public.event_attendances as attendance
        where attendance.event_id = event.id
          and attendance.membership_id = active_membership_id
          and attendance.attendance_status = 'active'
      ) as already_checked_in
    from public.club_events as event
    left join public.event_registrations as registration
      on registration.event_id = event.id
     and registration.app_account_id = actor_id
    left join lateral (
      select checkin.session_status, checkin.opens_at, checkin.expires_at
      from public.event_checkin_sessions as checkin
      where checkin.event_id = event.id
        and checkin.club_id = p_club_id
      order by checkin.created_at desc, checkin.id desc
      limit 1
    ) as session on true
    where event.club_id = p_club_id
      and event.event_status = 'published'
      and event.ends_at > now()
      -- The audience rule, which this projection never applied. An event
      -- addressed to particular tags was shown on the home page of every
      -- member of the club, complete with a 前往報名 button, while the events
      -- page it links to correctly refused to show or register it.
      and public.event_includes_current_member(event.id)
  ), ranked_events as (
    select
      candidate_events.*,
      row_number() over (
        order by
          case
            when starts_at <= now() then 0
            when (starts_at at time zone 'Asia/Taipei')::date = (now() at time zone 'Asia/Taipei')::date then 1
            else 2
          end,
          starts_at,
          id
      ) as position
    from candidate_events
  ), awaiting_response as (
    -- A member is asked to answer only where answering is still possible and
    -- they have not answered yet. A row with no registration at all and a row
    -- explicitly left pending are the same thing to the member: nobody knows
    -- whether they are coming.
    select
      id,
      title,
      starts_at,
      -- Carried so the countdown below can ask when registration closes: with
      -- no deadline of its own that is the end of the event.
      ends_at,
      registration_deadline
    from candidate_events
    where (my_response is null or my_response = 'pending')
      and public.event_registration_is_open(registration_deadline, starts_at, ends_at)
      -- Kept deliberately. For an event with no deadline the shared rule says
      -- "open until it ends", which is right for registering but wrong for a
      -- reminder: nobody needs to be told to answer a meeting already under
      -- way. The reminder stops at the start; registration does not.
      and now() < starts_at
    order by registration_deadline, starts_at, id
    limit 5
  ), upcoming_list as (
    -- The same ranking the hero uses, taken wider. The list column shows what
    -- is coming; the hero shows the first of them, so they cannot disagree.
    select
      id,
      title,
      starts_at,
      -- Needed by event_registration_is_open, which answers "until the event
      -- ends" for a blank deadline. Asking for it without selecting it is what
      -- CI caught: column item.ends_at does not exist.
      ends_at,
      registration_deadline,
      my_response
    from ranked_events
    where starts_at > now()
    order by position
    limit 4
  ), my_person as (
    -- The projection holds an app account and a membership; three of the new
    -- reminders are about the person behind them.
    select membership.person_id
    from public.club_memberships as membership
    where membership.id = active_membership_id
  ), dues_outstanding as (
    -- 社費未繳. The amount is the club's own figure, projected by the finance
    -- module; this only asks whether anything is still owed. Every year, not
    -- just the current one: dues left over from last year are still owed.
    select
      receivable.id,
      -- Which year is owed. /dues shows one Rotary year at a time and opens on
      -- the newest, so a reminder that only said 「社費未繳 · TWD 3000」 and
      -- linked to /dues sent a member who owes from last year to a page showing
      -- this year, settled, with nothing to say where to look.
      receivable.rotary_year_id,
      format('%s-%s', year_item.start_year, right((year_item.start_year + 1)::text, 2)) as year_label,
      (projected.value ->> 'outstanding_amount')::numeric as outstanding,
      -- From the receivable itself, which declares it not null. The finance
      -- projection has never carried a currency_code, so ->> answered null
      -- here, and a null anywhere in a || makes the whole concatenation null:
      -- the detail below became null, the parser rejected the row, and
      -- rejecting one row rejects the entire projection -- the member home
      -- went blank for everyone who still owed the club anything.
      receivable.currency_code
    from public.club_finance_receivables as receivable
    join public.club_memberships as membership
      on membership.id = receivable.membership_id
     and membership.club_id = p_club_id
    join my_person on my_person.person_id = membership.person_id
    join public.rotary_years as year_item
      on year_item.id = receivable.rotary_year_id
     and year_item.club_id = receivable.club_id
    cross join lateral (
      select public.project_dues_receivable(receivable.id) as value
    ) as projected
    where receivable.club_id = p_club_id
    order by receivable.created_at, receivable.id
    limit 20
  ), birthday_wishes_to_write as (
    -- 生日祝福待填寫. Someone is waiting on this member by name, which is the
    -- one kind here that another person notices when it is skipped.
    select
      participant.id,
      recipient.canonical_name as recipient_name,
      campaign.birthday_date
    from public.birthday_wish_campaign_participants as participant
    join public.birthday_wish_campaigns as campaign
      on campaign.id = participant.campaign_id
     and campaign.club_id = participant.club_id
    join public.club_memberships as recipient_membership
      on recipient_membership.id = campaign.recipient_membership_id
     and recipient_membership.club_id = p_club_id
    join public.people as recipient on recipient.id = recipient_membership.person_id
    left join lateral (
      select submission.submission_status
      from public.birthday_wish_campaign_submissions as submission
      where submission.participant_id = participant.id
        and submission.club_id = participant.club_id
      order by submission.revision_number desc, submission.id desc
      limit 1
    ) as latest on true
    where participant.club_id = p_club_id
      and participant.assignee_membership_id = active_membership_id
      and campaign.campaign_status in ('draft', 'collecting')
      and participant.participant_status not in ('declined', 'disabled')
      -- The shared rule, not a second one. This branch used to ask
      -- `<> 'published'` -- but publishing is the officer's action, not the
      -- member's, so a member who wrote and sent their wish was still told
      -- 「生日祝福待填寫」 with nothing left they could do. Meanwhile the notice
      -- for the very same assignment, built ten lines below from the very same
      -- statuses, had already called it completed.
      and public.birthday_wish_action_status(
        participant.participant_status, latest.submission_status
      ) in ('pending', 'needs_resubmission')
    order by campaign.birthday_date, participant.id
    limit 5
  ), profile_gaps as (
    -- 個人資料未完成. Deliberately narrow: the two things the club actually
    -- uses -- a way to reach the member, and the date it greets them on.
    -- Listing every empty column would make this a permanent fixture.
    select
      -- 「聯絡方式」, not 「電話」. /me states the rule on screen -- 手機與 Email
      -- 至少保留一項 -- and update_my_profile enforces exactly that. Asking for
      -- a phone specifically made this reminder unclearable for every member
      -- who keeps an email and no phone: they save, the platform tells them
      -- they are complete, and the reminder is still there tomorrow. A
      -- reminder the page it links to cannot satisfy is worse than none.
      (
        (person.primary_phone is null or btrim(person.primary_phone) = '')
        and (person.primary_email is null or btrim(person.primary_email) = '')
      ) as contact_missing,
      (person.birth_date is null) as birthday_missing
    from my_person
    join public.people as person on person.id = my_person.person_id
  ), presented_events as (
    select
      position,
      jsonb_build_object(
        'event_type', event_type,
        'title', title,
        'location', location,
        'cover_image_path', cover_image_path,
        'starts_at', starts_at,
        'ends_at', ends_at,
        'registration_state', case
          when my_response = 'attending' then 'registered'
          when my_response = 'pending' then 'pending'
          when my_response = 'declined' then 'declined'
          when public.event_registration_is_open(registration_deadline, starts_at, ends_at) then 'not_registered'
          else 'registration_closed'
        end,
        -- Whether registration is still open, asked separately from what the
        -- member answered. registration_state stops mentioning the deadline the
        -- moment there is a response, so a member who declined an event that is
        -- still open could not be offered a way to change their mind. Same rule
        -- as list_club_events, minus the published check: everything reaching
        -- this projection is already published.
        'registration_open', public.event_registration_is_open(registration_deadline, starts_at, ends_at),
        'checkin_state', case
          when already_checked_in then 'checked_in'
          when checkin_session_status = 'active'
            and now() >= checkin_opens_at
            and now() < checkin_expires_at then 'available'
          when checkin_session_status = 'closed' or checkin_expires_at <= now() then 'closed'
          else 'not_open'
        end
      ) as event
    from ranked_events
    where position <= 2
  ), recent_events as (
    select
      jsonb_build_object(
        'title', event.title,
        'location', event.location,
        'starts_at', event.starts_at,
        'attended', exists (
          select 1
          from public.event_attendances as attendance
          where attendance.event_id = event.id
            and attendance.membership_id = active_membership_id
            and attendance.attendance_status = 'active'
        )
      ) as event
    from public.club_events as event
    where event.club_id = p_club_id
      and event.event_status = 'published'
      and event.ends_at <= now()
      -- Same rule looking backwards: an event a member was never addressed to
      -- does not become theirs to review once it is over.
      and public.event_includes_current_member(event.id)
    order by event.ends_at desc, event.id desc
    limit 3
  ), message_deliveries as materialized (
    select
      message.id,
      message.title,
      left(message.body, 240) as body_preview,
      message.action_path,
      message.published_at,
      recipient.read_at
    from public.club_message_recipients as recipient
    join public.club_messages as message
      on message.id = recipient.message_id
     and message.club_id = recipient.club_id
    left join lateral (
      select public.birthday_wish_action_status(
        participant.participant_status, latest.submission_status
      ) as action_status
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
        and participant.assignee_membership_id = active_membership_id
      limit 1
    ) as birthday_assignment on true
    where recipient.club_id = p_club_id
      and recipient.membership_id = active_membership_id
      and message.status = 'active'
      and (
        recipient.birthday_participant_id is null
        or birthday_assignment.action_status in ('pending', 'needs_resubmission')
      )
  ), notification_items as materialized (
    select *
    from message_deliveries
    order by published_at desc, id desc
    limit 3
  )
  select jsonb_build_object(
    'club', jsonb_build_object(
      'club_code', target_club_code,
      'club_name', target_club_name
    ),
    'primary_event', (select event from presented_events where position = 1),
    'next_event', (select event from presented_events where position = 2),
    'recent_events', coalesce((select jsonb_agg(event) from recent_events), '[]'::jsonb),
    'upcoming_events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'event_id', item.id,
          'title', item.title,
          'starts_at', item.starts_at,
          -- The same three states the hero uses, so one event never reads as
          -- two different things in two places on one page.
          'registration_state', case
            when item.my_response = 'attending' then 'registered'
            when public.event_registration_is_open(item.registration_deadline, item.starts_at, item.ends_at) then 'open'
            else 'closed'
          end
        ) order by item.starts_at, item.id
      )
      from upcoming_list as item
    ), '[]'::jsonb),
    'pending_tasks', (
      -- One list, several kinds. Each row says what it is, what it is about,
      -- and where it goes. Only the kinds with a real deadline carry one; the
      -- page words urgency from hours_remaining and must not invent it.
      --
      -- sort_rank orders the kinds against each other: what has a deadline
      -- first, then money, then a person waiting by name, then the two that
      -- are only ever "when you get a moment".
      select coalesce(jsonb_agg(entry order by sort_rank, deadline nulls last, label), '[]'::jsonb)
      from (
        -- The parser refuses a list longer than it agreed to carry, and refusing
        -- the list blanks the page. The branches below have their own limits --
        -- five events, twenty receivables, five wishes -- which say how much each
        -- kind may contribute, not how long the list may be. This is the length.
        select sort_rank, deadline, label, entry
        from (
        select
          1 as sort_rank,
          public.event_registration_closes_at(task.registration_deadline, task.ends_at) as deadline,
          task.title as label,
          jsonb_build_object(
            'kind', 'event_response',
            'title', task.title,
            'detail', '',
            'action_path', '/events',
            -- When registration actually closes, not the column. An event with
            -- no deadline of its own still closes -- at the end of the event --
            -- and the countdown below is already measured to that moment. The
            -- column alone would be null while the countdown was a number, and
            -- a row that half-carries a deadline is rejected outright, taking
            -- the whole projection and the page with it.
            'deadline', public.event_registration_closes_at(
              task.registration_deadline, task.ends_at
            ),
            -- Hours, not a bucket: how soon "soon" is stays a product decision
            -- for the page to make, and it can change without a migration.
            'hours_remaining', floor(extract(epoch from (
              public.event_registration_closes_at(task.registration_deadline, task.ends_at) - now()
            )) / 3600)::integer,
            'count', null
          ) as entry
        from (select title, ends_at, registration_deadline from awaiting_response) as task

        union all
        select
          2, null::timestamptz, '社費',
          jsonb_build_object(
            'kind', 'dues_outstanding',
            'title', '社費未繳',
            -- concat_ws, not ||. Every value in a task row has to be non-null or
            -- the parser rejects the row, and || is the one thing here that
            -- manufactures a null out of code that reads as though it cannot:
            -- one null operand and the entire string is null. concat_ws drops
            -- a missing piece instead, so the worst case is a plainer label
            -- rather than no home page at all.
            -- The year first: a member who owes more than one gets a row for
            -- each, and 「TWD 3000」 repeated says nothing about which is which.
            'detail', concat_ws(
              ' · ',
              dues.year_label,
              concat_ws(' ', dues.currency_code, trim(to_char(dues.outstanding, 'FM999999990')))
            ),
            -- 我的社費 is at /dues. /me/finance was never a route: the
            -- reminder named the place it felt like it should be, and a member
            -- who tapped 社費未繳 landed on a not-found page.
            -- concat, not ||: the rule this projection keeps is that nothing
            -- in a task row may be built with an operator that turns one null
            -- operand into a null row. rotary_year_id is not null, but the rule
            -- is flat on purpose -- 「it cannot be null here」 is exactly the
            -- reasoning that put 缺聯絡電話 and a blank home page on staging.
            'action_path', concat('/dues?yearId=', dues.rotary_year_id::text),
            -- A receivable carries no due date of its own, so this reminder
            -- has none either. Inventing one would put a countdown on a date
            -- nobody set.
            'deadline', null,
            'hours_remaining', null,
            'count', null
          )
        from dues_outstanding as dues
        where dues.outstanding > 0

        union all
        select
          3, wish.birthday_date::timestamptz, wish.recipient_name,
          jsonb_build_object(
            'kind', 'birthday_wish',
            'title', '生日祝福待填寫',
            'detail', wish.recipient_name,
            'action_path', '/birthday-collection',
            -- Only while the day is still ahead. A campaign left collecting
            -- past the birthday still owes a wish -- that is the whole point
            -- of it still being open -- but the countdown to it is negative,
            -- and a negative countdown is rejected along with the row and the
            -- projection around it. Past the day it is a reminder without a
            -- deadline, like the other two.
            'deadline', case
              when wish.birthday_date::timestamptz > now()
                then wish.birthday_date::timestamptz
              else null
            end,
            'hours_remaining', case
              when wish.birthday_date::timestamptz > now()
                then floor(extract(epoch from (
                  wish.birthday_date::timestamptz - now()
                )) / 3600)::integer
              else null
            end,
            'count', null
          )
        from birthday_wishes_to_write as wish

        union all
        select
          4, null::timestamptz, '未讀訊息',
          jsonb_build_object(
            'kind', 'unread_messages',
            'title', '未讀的社內訊息',
            'detail', '',
            'action_path', '/messages',
            -- An unread message is not late, it is unread. A countdown here
            -- would be a due date nobody set.
            'deadline', null,
            'hours_remaining', null,
            'count', unread.unread_count
          )
        from (
          select count(*)::integer as unread_count
          from message_deliveries
          where message_deliveries.read_at is null
        ) as unread
        where unread.unread_count > 0

        union all
        select
          5, null::timestamptz, '個人資料',
          jsonb_build_object(
            'kind', 'profile_incomplete',
            'title', '個人資料未完成',
            'detail', case
              when gaps.contact_missing and gaps.birthday_missing then '缺聯絡方式與生日'
              when gaps.contact_missing then '缺聯絡方式'
              else '缺生日'
            end,
            'action_path', '/me',
            -- Never urgent, and never a countdown: nothing goes wrong if this
            -- is never done, and a reminder that cannot be late must not be
            -- able to shout.
            'deadline', null,
            'hours_remaining', null,
            'count', null
          )
        from profile_gaps as gaps
        where gaps.contact_missing or gaps.birthday_missing
        ) as candidate
        order by sort_rank, deadline nulls last, label
        limit 5
      ) as task
    ),
    'notifications', jsonb_build_object(
      'unread_count', (select count(*) from message_deliveries where read_at is null),
      'items', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'title', notification.title,
            'body_preview', notification.body_preview,
            'action_path', notification.action_path,
            'published_at', notification.published_at,
            'is_unread', notification.read_at is null
          ) order by notification.published_at desc, notification.id desc
        )
        from notification_items as notification
      ), '[]'::jsonb)
    )
  ) into result;

  return result;
end;
$$;



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
      -- The shared rule. This was the third copy of the same classification --
      -- two lived in get_my_member_home_projection until #185 collapsed them,
      -- and this one survived because that PR's guard only read that function.
      -- A rule written out three times is three things that can drift.
      public.birthday_wish_action_status(
        birthday_assignment.participant_status, birthday_assignment.submission_status
      ) as action_status
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

commit;

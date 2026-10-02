-- Club-managed Joy Wall prompt bank and fair, one-prompt-per-member batches.
-- Every dispatched prompt becomes a private-to-recipient Joy question post,
-- so the existing member task projection and answer lifecycle remain canonical.

alter table public.joy_wall_audit_events
  drop constraint joy_wall_audit_events_object_kind_check;
alter table public.joy_wall_audit_events
  add constraint joy_wall_audit_events_object_kind_check
  check (object_kind in ('post', 'comment', 'reaction', 'report', 'iou', 'question_prompt', 'question_batch'));
alter table public.joy_wall_audit_events
  drop constraint joy_wall_audit_events_event_type_check;
alter table public.joy_wall_audit_events
  add constraint joy_wall_audit_events_event_type_check
  check (event_type in (
    'post_created', 'post_updated', 'post_archived', 'comment_created',
    'reaction_changed', 'post_reported', 'report_dismissed', 'post_hidden',
    'iou_created', 'iou_accepted', 'iou_declined', 'iou_started',
    'iou_completion_confirmed', 'iou_completed', 'iou_cancelled',
    'question_prompt_created', 'question_prompt_updated', 'question_batch_dispatched'
  ));

create table public.joy_question_prompts (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid references public.clubs(id) on delete restrict,
  prompt_text text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by_app_account_id uuid references public.app_accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint joy_question_prompts_scope_creator_check check (
    (club_id is null and created_by_app_account_id is null)
    or (club_id is not null and created_by_app_account_id is not null)
  ),
  constraint joy_question_prompts_text_check check (
    char_length(btrim(prompt_text)) between 5 and 200
    and prompt_text !~ '^[[:space:]]*$'
  ),
  constraint joy_question_prompts_sort_check check (sort_order between 0 and 10000)
);

create unique index joy_question_prompts_system_text_unique
  on public.joy_question_prompts (lower(btrim(prompt_text))) where club_id is null;
create unique index joy_question_prompts_club_text_unique
  on public.joy_question_prompts (club_id, lower(btrim(prompt_text))) where club_id is not null;
create index joy_question_prompts_club_order_idx
  on public.joy_question_prompts (club_id, is_active, sort_order, id);

create table public.joy_question_batches (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  created_by_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  created_by_membership_id uuid not null,
  title text not null,
  request_id uuid not null,
  request_fingerprint text not null,
  created_at timestamptz not null default now(),
  constraint joy_question_batches_id_club_unique unique (id, club_id),
  constraint joy_question_batches_creator_membership_fkey
    foreign key (created_by_membership_id, club_id)
    references public.club_memberships(id, club_id) on delete restrict,
  constraint joy_question_batches_title_check check (
    char_length(btrim(title)) between 1 and 100 and title !~ '^[[:space:]]*$'
  ),
  constraint joy_question_batches_fingerprint_check check (request_fingerprint ~ '^[0-9a-f]{64}$')
);
create unique index joy_question_batches_request_unique
  on public.joy_question_batches (club_id, request_id);
create index joy_question_batches_club_created_idx
  on public.joy_question_batches (club_id, created_at desc, id desc);
create index joy_question_batches_creator_created_idx
  on public.joy_question_batches (club_id, created_by_app_account_id, created_at desc);

create table public.joy_question_batch_assignments (
  batch_id uuid not null,
  club_id uuid not null references public.clubs(id) on delete restrict,
  post_id uuid not null,
  prompt_id uuid not null references public.joy_question_prompts(id) on delete restrict,
  recipient_membership_id uuid not null,
  prompt_snapshot text not null,
  created_at timestamptz not null default now(),
  primary key (batch_id, recipient_membership_id),
  constraint joy_question_batch_assignments_batch_club_fkey
    foreign key (batch_id, club_id) references public.joy_question_batches(id, club_id) on delete restrict,
  constraint joy_question_batch_assignments_post_club_fkey
    foreign key (post_id, club_id) references public.joy_posts(id, club_id) on delete restrict,
  constraint joy_question_batch_assignments_recipient_club_fkey
    foreign key (recipient_membership_id, club_id)
    references public.club_memberships(id, club_id) on delete restrict,
  constraint joy_question_batch_assignments_prompt_unique unique (batch_id, prompt_id),
  constraint joy_question_batch_assignments_post_unique unique (post_id),
  constraint joy_question_batch_assignments_snapshot_check check (
    char_length(btrim(prompt_snapshot)) between 5 and 200
  )
);
create index joy_question_batch_assignments_club_recipient_idx
  on public.joy_question_batch_assignments (club_id, recipient_membership_id, created_at desc);

alter table public.joy_question_prompts enable row level security;
alter table public.joy_question_batches enable row level security;
alter table public.joy_question_batch_assignments enable row level security;
revoke all on table public.joy_question_prompts, public.joy_question_batches,
  public.joy_question_batch_assignments from public, anon, authenticated, service_role;

insert into public.joy_question_prompts (club_id, prompt_text, sort_order)
values
  (null, '最近哪一件社內小事，讓你覺得「有大家真好」？', 10),
  (null, '哪位社員曾用一個小舉動，讓你的工作或生活輕鬆了一點？', 20),
  (null, '你最想感謝本社哪一次默契十足的合作？', 30),
  (null, '最近一次社內活動，哪個畫面讓你忍不住微笑？', 40),
  (null, '你從哪位社員身上學到一個實用又受用的習慣？', 50),
  (null, '如果要為本社的一位夥伴頒一個「最佳神隊友」獎，你會選誰？為什麼？', 60),
  (null, '哪一場服務活動讓你最有「我們真的做到了」的感覺？', 70),
  (null, '本社做過哪一件小事，對社區的人可能很重要？', 80),
  (null, '如果有新社員加入，你最想帶他體驗哪一件社內日常？', 90),
  (null, '你和社友一起完成過最有成就感的一件事是什麼？', 100),
  (null, '哪一位社員的專業曾在恰好的時候幫上忙？', 110),
  (null, '如果本社可以多做一件讓社區更好的事，你希望是什麼？', 120),
  (null, '哪一次跨世代或跨專業合作，讓你看到新的可能？', 130),
  (null, '你最欣賞本社哪一種「說做就做」的行動力？', 140),
  (null, '有哪件服務成果值得再說一次，讓更多社員知道？', 150),
  (null, '哪一位夥伴總能在大家忙亂時，讓事情回到正軌？', 160),
  (null, '你希望本社下一次活動保留哪個讓人期待的環節？', 170),
  (null, '在扶輪的相處中，哪個瞬間讓你覺得自己也成長了？', 180),
  (null, '如果用一道菜形容本社的團隊合作，你會選什麼？為什麼？', 190),
  (null, '社友做過哪件看似普通、其實很暖心的事？', 200),
  (null, '你最想和哪位社友再合作一次？想一起完成什麼？', 210),
  (null, '本社哪一項傳統最值得留給新社員？', 220),
  (null, '今年哪一個服務時刻，最讓你感受到「服務人生」？', 230),
  (null, '哪位社友的一句提醒，曾讓事情變得更好？', 240),
  (null, '如果邀請一位社友分享專長，你最想聽他聊什麼？', 250),
  (null, '本社可以如何讓忙碌的社員也更容易參與服務？', 260),
  (null, '你曾在哪一刻發現，社友們的專長剛好拼成一個完整解方？', 270),
  (null, '哪一個社區需求值得本社多聽、多了解？', 280),
  (null, '最近有什麼值得在下次例會上公開感謝的事？', 290),
  (null, '如果為本社下一年度留下一句鼓勵，你會寫什麼？', 300)
on conflict do nothing;

create or replace function public.protect_batched_joy_question_post()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from public.joy_question_batch_assignments as assignment
    where assignment.post_id = old.id and assignment.club_id = old.club_id
  ) and (
    old.post_type is distinct from new.post_type
    or old.title is distinct from new.title
    or old.content is distinct from new.content
    or old.visibility_scope is distinct from new.visibility_scope
    or (
      old.post_status is distinct from new.post_status
      and not (
        old.post_status = 'published'
        and new.post_status = 'hidden'
        and new.hidden_by_app_account_id = public.current_app_account_id()
        and public.current_has_club_permission(old.club_id, 'joy.moderate')
      )
    )
  ) then
    raise exception using errcode = '23514', message = 'joy_batch_question_immutable';
  end if;
  return new;
end;
$$;
create trigger joy_posts_protect_batched_question
before update on public.joy_posts
for each row execute function public.protect_batched_joy_question_post();

create or replace function public.list_joy_question_recipient_options(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
begin
  if actor_membership_id is null
    or not public.current_has_club_permission(p_club_id, 'joy.moderate')
    or not exists (
      select 1 from public.platform_feature_flags as flag
      where flag.feature_key = 'joy_wall_v1' and flag.enabled
        and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
    ) then
    raise exception using errcode = '42501', message = 'joy_question_manager_required';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'membership_id', membership.id,
      'display_name', person.canonical_name,
      'avatar_url', person.avatar_url
    ) order by person.canonical_name, membership.id)
    from (
      select member.id, member.person_id
      from public.club_memberships as member
      where member.club_id = p_club_id
        and member.membership_status = 'active'
        and member.id <> actor_membership_id
        and exists (
          select 1 from public.app_accounts as account
          where account.person_id = member.person_id
            and account.account_status = 'active'
            and account.auth_user_id is not null
        )
      order by member.id
      limit 250
    ) as membership
    join public.people as person on person.id = membership.person_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_joy_question_manager_page(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if public.current_active_joy_membership(p_club_id) is null
    or not public.current_has_club_permission(p_club_id, 'joy.moderate')
    or not exists (
      select 1 from public.platform_feature_flags as flag
      where flag.feature_key = 'joy_wall_v1' and flag.enabled
        and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
    ) then
    raise exception using errcode = '42501', message = 'joy_question_manager_required';
  end if;
  return jsonb_build_object(
    'distinct_active_prompt_count', (
      select count(distinct lower(btrim(prompt.prompt_text)))::integer
      from public.joy_question_prompts as prompt
      where prompt.is_active and (prompt.club_id is null or prompt.club_id = p_club_id)
    ),
    'prompts', coalesce((
      select jsonb_agg(page.prompt order by page.source_order, page.sort_order, page.prompt_id)
      from (
        select jsonb_build_object(
          'id', prompt.id,
          'prompt_text', prompt.prompt_text,
          'source', case when prompt.club_id is null then 'platform' else 'club' end,
          'is_active', prompt.is_active,
          'sort_order', prompt.sort_order,
          'can_edit', coalesce(prompt.club_id = p_club_id, false)
        ) as prompt,
          prompt.id as prompt_id,
          case when prompt.club_id is null then 0 else 1 end as source_order,
          prompt.sort_order
        from public.joy_question_prompts as prompt
        where prompt.club_id is null or prompt.club_id = p_club_id
      ) as page
    ), '[]'::jsonb),
    'batches', coalesce((
      select jsonb_agg(page.batch order by page.created_at desc, page.batch_id desc)
      from (
        select jsonb_build_object(
          'id', batch.id,
          'title', batch.title,
          'created_at', batch.created_at,
        'assignment_count', count(assignment.post_id)::integer,
          'answered_count', count(assignment.post_id) filter (where exists (
            select 1 from public.joy_comments as answer
            where answer.post_id = assignment.post_id
              and answer.club_id = assignment.club_id
              and answer.author_membership_id = assignment.recipient_membership_id
              and answer.comment_type = 'answer'
              and answer.comment_status = 'active'
          ))::integer,
          'unavailable_count', count(assignment.post_id) filter (where post.post_status <> 'published')::integer
        ) as batch,
          batch.id as batch_id,
          batch.created_at
        from public.joy_question_batches as batch
        left join public.joy_question_batch_assignments as assignment
          on assignment.batch_id = batch.id and assignment.club_id = batch.club_id
        left join public.joy_posts as post
          on post.id = assignment.post_id and post.club_id = assignment.club_id
        where batch.club_id = p_club_id
        group by batch.id
        order by batch.created_at desc, batch.id desc
        limit 20
      ) as page
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.create_joy_question_prompt(p_club_id uuid, p_prompt_text text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
  normalized_text text := btrim(replace(replace(coalesce(p_prompt_text, ''), E'\r\n', E'\n'), E'\r', E'\n'));
  created_prompt public.joy_question_prompts;
begin
  if actor_id is null or actor_membership_id is null
    or not public.current_has_club_permission(p_club_id, 'joy.moderate')
    or not exists (
      select 1 from public.platform_feature_flags as flag
      where flag.feature_key = 'joy_wall_v1' and flag.enabled
        and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
    ) then
    raise exception using errcode = '42501', message = 'joy_question_manager_required';
  end if;
  if char_length(normalized_text) not between 5 and 200 or normalized_text ~ '^[[:space:]]*$' then
    raise exception using errcode = '22023', message = 'invalid_joy_question_prompt';
  end if;
  if exists (
    select 1 from public.joy_question_prompts as prompt
    where (prompt.club_id is null or prompt.club_id = p_club_id)
      and lower(btrim(prompt.prompt_text)) = lower(normalized_text)
  ) then
    raise exception using errcode = '22023', message = 'duplicate_joy_question_prompt';
  end if;
  insert into public.joy_question_prompts (
    club_id, prompt_text, is_active, sort_order, created_by_app_account_id
  ) values (
    p_club_id, normalized_text, true,
    coalesce((select max(prompt.sort_order) + 10 from public.joy_question_prompts as prompt
      where prompt.club_id = p_club_id), 10),
    actor_id
  ) returning * into created_prompt;
  insert into public.joy_wall_audit_events (
    club_id, actor_app_account_id, object_kind, object_id, event_type, details
  ) values (
    p_club_id, actor_id, 'question_prompt', created_prompt.id, 'question_prompt_created',
    jsonb_build_object('is_active', created_prompt.is_active, 'sort_order', created_prompt.sort_order)
  );
  return jsonb_build_object(
    'id', created_prompt.id, 'prompt_text', created_prompt.prompt_text,
    'source', 'club', 'is_active', created_prompt.is_active,
    'sort_order', created_prompt.sort_order, 'can_edit', true
  );
end;
$$;

create or replace function public.update_joy_question_prompt(
  p_club_id uuid, p_prompt_id uuid, p_prompt_text text, p_is_active boolean, p_sort_order integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
  normalized_text text := btrim(replace(replace(coalesce(p_prompt_text, ''), E'\r\n', E'\n'), E'\r', E'\n'));
  updated_prompt public.joy_question_prompts;
begin
  if actor_id is null or actor_membership_id is null
    or not public.current_has_club_permission(p_club_id, 'joy.moderate')
    or not exists (
      select 1 from public.platform_feature_flags as flag
      where flag.feature_key = 'joy_wall_v1' and flag.enabled
        and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
    ) then
    raise exception using errcode = '42501', message = 'joy_question_manager_required';
  end if;
  if char_length(normalized_text) not between 5 and 200 or normalized_text ~ '^[[:space:]]*$'
    or p_is_active is null or p_sort_order is null or p_sort_order not between 0 and 10000 then
    raise exception using errcode = '22023', message = 'invalid_joy_question_prompt';
  end if;
  if exists (
    select 1 from public.joy_question_prompts as prompt
    where (prompt.club_id is null or prompt.club_id = p_club_id)
      and prompt.id <> p_prompt_id
      and lower(btrim(prompt.prompt_text)) = lower(normalized_text)
  ) then
    raise exception using errcode = '22023', message = 'duplicate_joy_question_prompt';
  end if;
  update public.joy_question_prompts as prompt
    set prompt_text = normalized_text, is_active = p_is_active,
        sort_order = p_sort_order, updated_at = statement_timestamp()
  where prompt.id = p_prompt_id and prompt.club_id = p_club_id
  returning * into updated_prompt;
  if not found then
    raise exception using errcode = 'P0002', message = 'joy_question_prompt_not_available';
  end if;
  insert into public.joy_wall_audit_events (
    club_id, actor_app_account_id, object_kind, object_id, event_type, details
  ) values (
    p_club_id, actor_id, 'question_prompt', updated_prompt.id, 'question_prompt_updated',
    jsonb_build_object('is_active', updated_prompt.is_active, 'sort_order', updated_prompt.sort_order)
  );
  return jsonb_build_object(
    'id', updated_prompt.id, 'prompt_text', updated_prompt.prompt_text,
    'source', 'club', 'is_active', updated_prompt.is_active,
    'sort_order', updated_prompt.sort_order, 'can_edit', true
  );
end;
$$;

create or replace function public.dispatch_joy_question_batch(
  p_club_id uuid, p_title text, p_recipient_membership_ids uuid[], p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_active_joy_membership(p_club_id);
  normalized_title text := btrim(coalesce(p_title, ''));
  wanted_members uuid[] := coalesce(p_recipient_membership_ids, '{}'::uuid[]);
  request_fingerprint text;
  existing_batch public.joy_question_batches;
  created_batch public.joy_question_batches;
  assignment record;
  created_post public.joy_posts;
  recent_batch_count integer;
begin
  if actor_id is null or actor_membership_id is null
    or not public.current_has_club_permission(p_club_id, 'joy.moderate')
    or not exists (
      select 1 from public.platform_feature_flags as flag
      where flag.feature_key = 'joy_wall_v1' and flag.enabled
        and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
    ) then
    raise exception using errcode = '42501', message = 'joy_question_manager_required';
  end if;
  if p_request_id is null or char_length(normalized_title) not between 1 and 100
    or normalized_title ~ '^[[:space:]]*$'
    or coalesce(array_length(wanted_members, 1), 0) not between 1 and 250
    or cardinality(wanted_members) <> cardinality(array(
      select distinct requested.id from unnest(wanted_members) as requested(id)
    ))
    or actor_membership_id = any(wanted_members)
    or exists (select 1 from unnest(wanted_members) as requested(id) where requested.id is null)
    or exists (
      select 1 from unnest(wanted_members) as requested(id)
      where not exists (
        select 1
        from public.club_memberships as member
        where member.id = requested.id and member.club_id = p_club_id
          and member.membership_status = 'active'
          and exists (
            select 1 from public.app_accounts as account
            where account.person_id = member.person_id
              and account.account_status = 'active'
              and account.auth_user_id is not null
          )
      )
    ) then
    raise exception using errcode = '22023', message = 'invalid_joy_question_batch';
  end if;

  request_fingerprint := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'title', normalized_title,
      'recipient_membership_ids', to_jsonb(array(
        select recipient.member_id::text
        from unnest(wanted_members) as recipient(member_id)
        order by recipient.member_id
      ))
    )::text,
    'UTF8'
  ), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_club_id::text || ':' || p_request_id::text, 0)
  );
  select * into existing_batch
  from public.joy_question_batches as batch
  where batch.club_id = p_club_id and batch.request_id = p_request_id
  for update;
  if found then
    if existing_batch.created_by_app_account_id <> actor_id
      or existing_batch.request_fingerprint <> request_fingerprint then
      raise exception using errcode = '22023', message = 'joy_question_batch_idempotency_conflict';
    end if;
    return jsonb_build_object(
      'id', existing_batch.id, 'title', existing_batch.title,
      'created_at', existing_batch.created_at,
      'assignment_count', (select count(*)::integer from public.joy_question_batch_assignments as batch_assignment
        where batch_assignment.batch_id = existing_batch.id and batch_assignment.club_id = p_club_id),
      'replayed', true
    );
  end if;

  select count(*)::integer into recent_batch_count
  from public.joy_question_batches as batch
  where batch.club_id = p_club_id
    and batch.created_by_app_account_id = actor_id
    and batch.created_at >= statement_timestamp() - interval '1 hour';
  if recent_batch_count >= 5 then
    raise exception using errcode = '54000', message = 'joy_question_batch_rate_limited';
  end if;

  if (
    select count(distinct lower(btrim(prompt.prompt_text)))
    from public.joy_question_prompts as prompt
    where prompt.is_active and (prompt.club_id is null or prompt.club_id = p_club_id)
  ) < cardinality(wanted_members) then
    raise exception using errcode = '54000', message = 'joy_question_prompt_bank_exhausted';
  end if;

  insert into public.joy_question_batches (
    club_id, created_by_app_account_id, created_by_membership_id,
    title, request_id, request_fingerprint
  ) values (
    p_club_id, actor_id, actor_membership_id,
    normalized_title, p_request_id, request_fingerprint
  ) returning * into created_batch;

  for assignment in
    with recipients as (
      select requested.id as membership_id,
        row_number() over (order by extensions.gen_random_uuid()) as row_number
      from unnest(wanted_members) as requested(id)
    ), available_prompts as (
      select distinct on (lower(btrim(prompt.prompt_text))) prompt.id, prompt.prompt_text
      from public.joy_question_prompts as prompt
      where prompt.is_active and (prompt.club_id is null or prompt.club_id = p_club_id)
      order by lower(btrim(prompt.prompt_text)),
        case when prompt.club_id = p_club_id then 0 else 1 end,
        prompt.id
    ), selected_prompts as (
      select prompt.id, prompt.prompt_text
      from available_prompts as prompt
      order by extensions.gen_random_uuid()
      limit cardinality(wanted_members)
    ), prompts as (
      select selected.id, selected.prompt_text,
        row_number() over (order by extensions.gen_random_uuid()) as row_number
      from selected_prompts as selected
    )
    select recipients.membership_id, prompts.id as prompt_id, prompts.prompt_text
    from recipients join prompts using (row_number)
    order by recipients.row_number
  loop
    insert into public.joy_posts (
      club_id, author_app_account_id, author_membership_id,
      post_type, title, content, visibility_scope
    ) values (
      p_club_id, actor_id, actor_membership_id,
      'question', normalized_title, assignment.prompt_text, 'selected'
    ) returning * into created_post;
    insert into public.joy_post_audiences (post_id, club_id, membership_id)
    values (created_post.id, p_club_id, assignment.membership_id);
    insert into public.joy_question_batch_assignments (
      batch_id, club_id, post_id, prompt_id,
      recipient_membership_id, prompt_snapshot
    ) values (
      created_batch.id, p_club_id, created_post.id, assignment.prompt_id,
      assignment.membership_id, assignment.prompt_text
    );
    insert into public.joy_wall_audit_events (
      club_id, actor_app_account_id, object_kind, object_id, event_type, details
    ) values (
      p_club_id, actor_id, 'post', created_post.id, 'post_created',
      jsonb_build_object('source', 'question_batch', 'batch_id', created_batch.id)
    );
  end loop;
  insert into public.joy_wall_audit_events (
    club_id, actor_app_account_id, object_kind, object_id, event_type, details
  ) values (
    p_club_id, actor_id, 'question_batch', created_batch.id, 'question_batch_dispatched',
    jsonb_build_object('assignment_count', cardinality(wanted_members))
  );
  return jsonb_build_object(
    'id', created_batch.id, 'title', created_batch.title,
    'created_at', created_batch.created_at,
    'assignment_count', cardinality(wanted_members), 'replayed', false
  );
end;
$$;

create or replace function public.get_joy_question_batch_detail(p_club_id uuid, p_batch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  batch public.joy_question_batches;
begin
  if public.current_active_joy_membership(p_club_id) is null
    or not public.current_has_club_permission(p_club_id, 'joy.moderate')
    or not exists (
      select 1 from public.platform_feature_flags as flag
      where flag.feature_key = 'joy_wall_v1' and flag.enabled
        and flag.rollout_percentage > 0 and cardinality(flag.enabled_environments) > 0
    ) then
    raise exception using errcode = '42501', message = 'joy_question_manager_required';
  end if;
  select * into batch from public.joy_question_batches as candidate
  where candidate.id = p_batch_id and candidate.club_id = p_club_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'joy_question_batch_not_available';
  end if;
  return jsonb_build_object(
    'id', batch.id,
    'title', batch.title,
    'created_at', batch.created_at,
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'post_id', assignment.post_id,
        'recipient_membership_id', assignment.recipient_membership_id,
        'recipient_display_name', person.canonical_name,
        'prompt_text', assignment.prompt_snapshot,
        'answered', exists (
          select 1 from public.joy_comments as answer
          where answer.post_id = assignment.post_id and answer.club_id = assignment.club_id
            and answer.author_membership_id = assignment.recipient_membership_id
            and answer.comment_type = 'answer' and answer.comment_status = 'active'
        ),
        'available', post.post_status = 'published'
      ) order by person.canonical_name, assignment.recipient_membership_id)
      from public.joy_question_batch_assignments as assignment
      join public.club_memberships as member
        on member.id = assignment.recipient_membership_id and member.club_id = assignment.club_id
      join public.people as person on person.id = member.person_id
      join public.joy_posts as post on post.id = assignment.post_id and post.club_id = assignment.club_id
      where assignment.batch_id = batch.id and assignment.club_id = p_club_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.protect_batched_joy_question_post() from public, anon, authenticated, service_role;
revoke all on function public.list_joy_question_recipient_options(uuid) from public, anon;
revoke all on function public.get_joy_question_manager_page(uuid) from public, anon;
revoke all on function public.create_joy_question_prompt(uuid, text) from public, anon;
revoke all on function public.update_joy_question_prompt(uuid, uuid, text, boolean, integer) from public, anon;
revoke all on function public.dispatch_joy_question_batch(uuid, text, uuid[], uuid) from public, anon;
revoke all on function public.get_joy_question_batch_detail(uuid, uuid) from public, anon;
grant execute on function public.list_joy_question_recipient_options(uuid) to authenticated;
grant execute on function public.get_joy_question_manager_page(uuid) to authenticated;
grant execute on function public.create_joy_question_prompt(uuid, text) to authenticated;
grant execute on function public.update_joy_question_prompt(uuid, uuid, text, boolean, integer) to authenticated;
grant execute on function public.dispatch_joy_question_batch(uuid, text, uuid[], uuid) to authenticated;
grant execute on function public.get_joy_question_batch_detail(uuid, uuid) to authenticated;

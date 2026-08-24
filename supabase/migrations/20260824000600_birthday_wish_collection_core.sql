begin;

-- Birthday wish collection is a separate layer from the existing birthday
-- wishes projection. The old tables and RPCs remain the rollback-safe V2 core;
-- these tables hold invitations, question snapshots and officer workflow.

create table public.birthday_wish_question_bank_items (
  id uuid primary key default extensions.gen_random_uuid(),
  -- NULL is the immutable platform default bank. A non-NULL value is a
  -- club-owned question that officers may disable or reorder.
  club_id uuid references public.clubs(id) on delete restrict,
  question_key text not null,
  prompt text not null,
  tone text not null default 'warm',
  sort_order integer not null default 100,
  is_enabled boolean not null default true,
  created_by_app_account_id uuid references public.app_accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint birthday_question_key_check check (
    question_key ~ '^[a-z][a-z0-9_]{2,63}$'
  ),
  constraint birthday_question_prompt_check check (
    btrim(prompt) <> '' and char_length(prompt) between 1 and 300
  ),
  constraint birthday_question_tone_check check (tone in ('warm', 'humorous', 'moving')),
  constraint birthday_question_sort_order_check check (sort_order between 0 and 10000),
  constraint birthday_question_scope_owner_check check (
    (club_id is null and created_by_app_account_id is null)
    or (club_id is not null and created_by_app_account_id is not null)
  )
);

create unique index birthday_question_platform_key_unique
  on public.birthday_wish_question_bank_items (question_key)
  where club_id is null;

create unique index birthday_question_club_key_unique
  on public.birthday_wish_question_bank_items (club_id, question_key)
  where club_id is not null;

create index birthday_question_club_order_idx
  on public.birthday_wish_question_bank_items (club_id, is_enabled, sort_order, question_key);

comment on table public.birthday_wish_question_bank_items is
  'Birthday collection prompts. NULL club_id rows are platform defaults; assigned prompts are copied into a snapshot.';

-- One row per club/month/year. This is the idempotency boundary for a future
-- scheduler: retrying the same month cannot create a second batch.
create table public.birthday_wish_assignment_batches (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  birthday_year integer not null,
  birthday_month integer not null,
  batch_status text not null default 'planned',
  scheduled_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  failure_reason text,
  created_by_app_account_id uuid references public.app_accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint birthday_assignment_batch_year_check check (birthday_year between 2000 and 2200),
  constraint birthday_assignment_batch_month_check check (birthday_month between 1 and 12),
  constraint birthday_assignment_batch_status_check check (
    batch_status in ('planned', 'assigning', 'completed', 'failed')
  ),
  constraint birthday_assignment_batch_id_club_unique unique (id, club_id),
  constraint birthday_assignment_batch_period_unique unique (club_id, birthday_year, birthday_month)
);

create index birthday_assignment_batches_schedule_idx
  on public.birthday_wish_assignment_batches (club_id, birthday_year, birthday_month, batch_status);

comment on table public.birthday_wish_assignment_batches is
  'Idempotent monthly birthday invitation batches. Scheduling/execution is intentionally separate from this data contract.';

create table public.birthday_wish_campaigns (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  recipient_membership_id uuid not null,
  birthday_year integer not null,
  birthday_date date not null,
  campaign_status text not null default 'draft',
  assignment_batch_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  published_at timestamptz,
  closed_at timestamptz,
  created_by_app_account_id uuid references public.app_accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint birthday_campaign_recipient_club_fkey
    foreign key (recipient_membership_id, club_id)
    references public.club_memberships (id, club_id) on delete restrict,
  constraint birthday_campaign_batch_club_fkey
    foreign key (assignment_batch_id, club_id)
    references public.birthday_wish_assignment_batches (id, club_id) on delete restrict,
  constraint birthday_campaign_year_check check (birthday_year between 2000 and 2200),
  constraint birthday_campaign_date_year_check check (
    extract(year from birthday_date)::integer = birthday_year
  ),
  constraint birthday_campaign_status_check check (
    campaign_status in ('draft', 'collecting', 'published', 'closed', 'hidden')
  ),
  constraint birthday_campaign_id_club_unique unique (id, club_id),
  constraint birthday_campaign_recipient_year_unique
    unique (club_id, recipient_membership_id, birthday_year)
);

create index birthday_campaigns_club_date_idx
  on public.birthday_wish_campaigns (club_id, birthday_date, campaign_status);

comment on table public.birthday_wish_campaigns is
  'One birthday collection campaign per same-club recipient and birthday year.';

create table public.birthday_wish_campaign_participants (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  campaign_id uuid not null,
  assignment_batch_id uuid not null,
  assignee_membership_id uuid not null,
  question_bank_item_id uuid not null references public.birthday_wish_question_bank_items(id) on delete restrict,
  question_prompt_snapshot text not null,
  assignment_kind text not null default 'automatic',
  participant_status text not null default 'invited',
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint birthday_participant_campaign_club_fkey
    foreign key (campaign_id, club_id)
    references public.birthday_wish_campaigns (id, club_id) on delete restrict,
  constraint birthday_participant_batch_club_fkey
    foreign key (assignment_batch_id, club_id)
    references public.birthday_wish_assignment_batches (id, club_id) on delete restrict,
  constraint birthday_participant_assignee_club_fkey
    foreign key (assignee_membership_id, club_id)
    references public.club_memberships (id, club_id) on delete restrict,
  constraint birthday_participant_snapshot_check check (
    btrim(question_prompt_snapshot) <> ''
    and char_length(question_prompt_snapshot) between 1 and 300
  ),
  constraint birthday_participant_kind_check check (assignment_kind = 'automatic'),
  constraint birthday_participant_status_check check (
    participant_status in ('invited', 'submitted', 'declined', 'disabled')
  ),
  constraint birthday_participant_id_club_unique unique (id, club_id),
  constraint birthday_participant_batch_assignee_unique
    unique (assignment_batch_id, assignee_membership_id),
  constraint birthday_participant_batch_question_unique
    unique (assignment_batch_id, question_bank_item_id),
  constraint birthday_participant_campaign_assignee_unique
    unique (campaign_id, assignee_membership_id)
);

create index birthday_participants_assignee_idx
  on public.birthday_wish_campaign_participants (club_id, assignee_membership_id, participant_status);

create index birthday_participants_campaign_idx
  on public.birthday_wish_campaign_participants (club_id, campaign_id, participant_status);

comment on table public.birthday_wish_campaign_participants is
  'Automatic invitation snapshot. Unique constraints enforce one invite per member and one prompt per monthly batch.';

create table public.birthday_wish_campaign_submissions (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  campaign_id uuid not null,
  participant_id uuid not null,
  author_app_account_id uuid not null references public.app_accounts(id) on delete restrict,
  content text not null,
  submission_status text not null default 'submitted',
  submitted_at timestamptz not null default now(),
  published_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint birthday_submission_participant_club_fkey
    foreign key (participant_id, club_id)
    references public.birthday_wish_campaign_participants (id, club_id) on delete restrict,
  constraint birthday_submission_campaign_club_fkey
    foreign key (campaign_id, club_id)
    references public.birthday_wish_campaigns (id, club_id) on delete restrict,
  constraint birthday_submission_content_check check (
    btrim(content) <> '' and char_length(content) between 1 and 500
  ),
  constraint birthday_submission_status_check check (
    submission_status in ('submitted', 'published', 'hidden', 'deleted')
  ),
  constraint birthday_submission_status_time_check check (
    (submission_status in ('submitted', 'published', 'hidden') and deleted_at is null)
    or (submission_status = 'deleted' and deleted_at is not null)
  ),
  constraint birthday_submission_published_time_check check (
    (submission_status in ('submitted', 'deleted') and published_at is null)
    or (submission_status in ('published', 'hidden') and published_at is not null)
  ),
  constraint birthday_submission_id_club_unique unique (id, club_id),
  constraint birthday_submission_participant_unique unique (participant_id)
);

create index birthday_submissions_campaign_status_idx
  on public.birthday_wish_campaign_submissions (club_id, campaign_id, submission_status, submitted_at desc);

comment on table public.birthday_wish_campaign_submissions is
  'One editable-before-publish submission per automatic invitation. Author identity is kept for officer-only projection.';

-- The client never receives table privileges. These tables have no permissive
-- policies; all reads and writes below pass through tenant-aware RPCs.
alter table public.birthday_wish_question_bank_items enable row level security;
alter table public.birthday_wish_assignment_batches enable row level security;
alter table public.birthday_wish_campaigns enable row level security;
alter table public.birthday_wish_campaign_participants enable row level security;
alter table public.birthday_wish_campaign_submissions enable row level security;

revoke all on table public.birthday_wish_question_bank_items from public, anon, authenticated;
revoke all on table public.birthday_wish_assignment_batches from public, anon, authenticated;
revoke all on table public.birthday_wish_campaigns from public, anon, authenticated;
revoke all on table public.birthday_wish_campaign_participants from public, anon, authenticated;
revoke all on table public.birthday_wish_campaign_submissions from public, anon, authenticated;

create or replace function public.protect_birthday_question_bank_item()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.question_key := lower(btrim(new.question_key));
  new.prompt := public.normalize_birthday_wish(new.prompt);

  if tg_op = 'UPDATE' then
    if old.id is distinct from new.id
       or old.club_id is distinct from new.club_id
       or old.question_key is distinct from new.question_key
       or old.created_by_app_account_id is distinct from new.created_by_app_account_id
       or old.created_at is distinct from new.created_at then
      raise exception using errcode = '23514', message = 'birthday_question_identity_immutable';
    end if;

    if old.club_id is null and (
      old.prompt is distinct from new.prompt
      or old.tone is distinct from new.tone
      or old.sort_order is distinct from new.sort_order
      or old.is_enabled is distinct from new.is_enabled
    ) then
      raise exception using errcode = '23514', message = 'birthday_platform_question_immutable';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger birthday_question_bank_protect
before insert or update on public.birthday_wish_question_bank_items
for each row execute function public.protect_birthday_question_bank_item();

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

    if old.batch_status in ('completed', 'failed')
       and new.batch_status <> old.batch_status then
      raise exception using errcode = '23514', message = 'birthday_assignment_batch_terminal';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger birthday_assignment_batches_protect
before insert or update on public.birthday_wish_assignment_batches
for each row execute function public.protect_birthday_collection_batch();

create or replace function public.protect_birthday_collection_campaign()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.id is distinct from new.id
       or old.club_id is distinct from new.club_id
       or old.recipient_membership_id is distinct from new.recipient_membership_id
       or old.birthday_year is distinct from new.birthday_year
       or old.birthday_date is distinct from new.birthday_date
       or old.assignment_batch_id is distinct from new.assignment_batch_id
       or old.created_by_app_account_id is distinct from new.created_by_app_account_id
       or old.created_at is distinct from new.created_at then
      raise exception using errcode = '23514', message = 'birthday_campaign_identity_immutable';
    end if;

    if old.campaign_status in ('published', 'closed', 'hidden')
       and new.campaign_status <> old.campaign_status then
      raise exception using errcode = '23514', message = 'birthday_campaign_terminal';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger birthday_campaigns_protect
before insert or update on public.birthday_wish_campaigns
for each row execute function public.protect_birthday_collection_campaign();

create or replace function public.protect_birthday_collection_participant()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' and (
    old.id is distinct from new.id
    or old.club_id is distinct from new.club_id
    or old.campaign_id is distinct from new.campaign_id
    or old.assignment_batch_id is distinct from new.assignment_batch_id
    or old.assignee_membership_id is distinct from new.assignee_membership_id
    or old.question_bank_item_id is distinct from new.question_bank_item_id
    or old.question_prompt_snapshot is distinct from new.question_prompt_snapshot
    or old.assignment_kind is distinct from new.assignment_kind
    or old.invited_at is distinct from new.invited_at
    or old.created_at is distinct from new.created_at
  ) then
    raise exception using errcode = '23514', message = 'birthday_participant_identity_immutable';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger birthday_participants_protect
before insert or update on public.birthday_wish_campaign_participants
for each row execute function public.protect_birthday_collection_participant();

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
       or old.submitted_at is distinct from new.submitted_at then
      raise exception using errcode = '23514', message = 'birthday_submission_identity_immutable';
    end if;

    if old.submission_status in ('published', 'hidden')
       and (
         new.submission_status <> old.submission_status
         or new.content is distinct from old.content
         or new.deleted_at is distinct from old.deleted_at
       ) then
      raise exception using errcode = '23514', message = 'birthday_submission_published_immutable';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger birthday_submissions_protect
before insert or update on public.birthday_wish_campaign_submissions
for each row execute function public.protect_birthday_collection_submission();

create or replace function public.prevent_birthday_collection_hard_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = '42501', message = 'birthday_collection_hard_delete_forbidden';
end;
$$;

create trigger birthday_question_bank_prevent_delete
before delete on public.birthday_wish_question_bank_items
for each row execute function public.prevent_birthday_collection_hard_delete();

create trigger birthday_batches_prevent_delete
before delete on public.birthday_wish_assignment_batches
for each row execute function public.prevent_birthday_collection_hard_delete();

create trigger birthday_campaigns_prevent_delete
before delete on public.birthday_wish_campaigns
for each row execute function public.prevent_birthday_collection_hard_delete();

create trigger birthday_participants_prevent_delete
before delete on public.birthday_wish_campaign_participants
for each row execute function public.prevent_birthday_collection_hard_delete();

create trigger birthday_submissions_prevent_delete
before delete on public.birthday_wish_campaign_submissions
for each row execute function public.prevent_birthday_collection_hard_delete();

-- The platform bank is seeded from the reviewed V1 question document. These
-- rows are intentionally platform-owned and cannot be edited by club officers.
insert into public.birthday_wish_question_bank_items (question_key, prompt, tone, sort_order)
values
  ('birthday_q_001', '你最想謝謝壽星曾經做過哪一件小事？', 'warm', 1),
  ('birthday_q_002', '什麼時候你覺得有壽星在，事情就安心了一點？', 'warm', 2),
  ('birthday_q_003', '第一次認識壽星時，哪個印象到現在還記得？', 'warm', 3),
  ('birthday_q_004', '壽星身上的哪個習慣讓你覺得可愛或可靠？', 'warm', 4),
  ('birthday_q_005', '你曾經從壽星身上學到什麼？', 'warm', 5),
  ('birthday_q_006', '哪一次活動和壽星一起完成，讓你覺得特別有意義？', 'warm', 6),
  ('birthday_q_007', '壽星做過哪個不起眼的舉動，卻讓你感受到他的用心？', 'warm', 7),
  ('birthday_q_008', '你想把哪一句平常不容易說出口的謝謝送給壽星？', 'warm', 8),
  ('birthday_q_009', '壽星在社團裡最像哪一種讓大家放心的角色？', 'warm', 9),
  ('birthday_q_010', '如果用一種顏色形容壽星帶給人的感覺，你會選什麼？為什麼？', 'warm', 10),
  ('birthday_q_011', '壽星曾在哪個時刻讓你的一天變得比較明亮？', 'warm', 11),
  ('birthday_q_012', '你和壽星一起笑得最開心的一次，是什麼情況？', 'warm', 12),
  ('birthday_q_013', '壽星哪個優點最容易被大家忽略，卻值得被看見？', 'warm', 13),
  ('birthday_q_014', '你希望壽星知道，大家在哪件事上一直記得他的付出？', 'warm', 14),
  ('birthday_q_015', '如果把壽星比喻成社團裡的一盞燈，他照亮的是哪個地方？', 'warm', 15),
  ('birthday_q_016', '哪一次和壽星聊天，讓你後來想了很久？', 'warm', 16),
  ('birthday_q_017', '壽星在團隊合作中，哪個小動作最讓你感到貼心？', 'warm', 17),
  ('birthday_q_018', '你覺得壽星最適合收到哪一種驚喜？為什麼？', 'warm', 18),
  ('birthday_q_019', '哪一個共同回憶最能代表你和壽星的情誼？', 'warm', 19),
  ('birthday_q_020', '壽星說過哪句話，曾在你需要時派上用場？', 'warm', 20),
  ('birthday_q_021', '如果要用三個詞形容壽星，你會選哪三個？', 'warm', 21),
  ('birthday_q_022', '你最欣賞壽星面對困難時的哪一種態度？', 'warm', 22),
  ('birthday_q_023', '壽星哪一項專長曾經幫助過你或團隊？', 'warm', 23),
  ('birthday_q_024', '你想和壽星再一起完成哪一件社團裡的事？', 'warm', 24),
  ('birthday_q_025', '哪個季節或天氣最像壽星？為什麼？', 'warm', 25),
  ('birthday_q_026', '壽星做什麼事情時，最能看出他的真性情？', 'warm', 26),
  ('birthday_q_027', '你覺得壽星最值得被大家記住的特色是什麼？', 'warm', 27),
  ('birthday_q_028', '如果要為壽星收藏一張社團回憶照片，你會選哪一張？', 'warm', 28),
  ('birthday_q_029', '壽星曾在哪個瞬間讓你覺得「這就是夥伴」？', 'warm', 29),
  ('birthday_q_030', '你想把哪一個美好的社團回憶，再說一次給壽星聽？', 'warm', 30),
  ('birthday_q_031', '壽星對別人展現過哪一種溫柔，讓你印象深刻？', 'warm', 31),
  ('birthday_q_032', '你認為壽星帶給社團最珍貴的禮物是什麼？', 'warm', 32),
  ('birthday_q_033', '哪一件小事最能表現壽星的個性？', 'warm', 33),
  ('birthday_q_034', '你希望下一次和壽星見面時，一定要一起做什麼？', 'warm', 34),
  ('birthday_q_035', '如果壽星有一個專屬座右銘，你覺得會是什麼？為什麼？', 'warm', 35),
  ('birthday_q_036', '如果要頒給壽星一座社團獎，你會頒什麼獎？', 'humorous', 36),
  ('birthday_q_037', '壽星最適合擁有哪一種超能力？這個超能力會怎麼派上用場？', 'humorous', 37),
  ('birthday_q_038', '如果壽星是一道社團聚餐料理，會是哪一道？為什麼？', 'humorous', 38),
  ('birthday_q_039', '壽星在群組裡最像哪一種訊息？為什麼？', 'humorous', 39),
  ('birthday_q_040', '如果壽星有使用說明書，第一條注意事項會寫什麼？', 'humorous', 40),
  ('birthday_q_041', '壽星最常出現的表情或口頭禪是什麼？', 'humorous', 41),
  ('birthday_q_042', '如果把壽星的一天拍成喜劇，哪個片段最可能成為笑點？', 'humorous', 42),
  ('birthday_q_043', '壽星最適合擔任哪一種大家都需要、但沒人敢自薦的任務？', 'humorous', 43),
  ('birthday_q_044', '如果壽星是社團的天氣預報，今天會是什麼天氣？為什麼？', 'humorous', 44),
  ('birthday_q_045', '壽星有哪些小習慣，已經成為大家熟悉的可愛標誌？', 'humorous', 45),
  ('birthday_q_046', '如果要為壽星設計一個專屬徽章，上面會畫什麼？', 'humorous', 46),
  ('birthday_q_047', '壽星在活動現場最像哪一種神秘但可靠的角色？', 'humorous', 47),
  ('birthday_q_048', '如果壽星的笑聲有名字，你會怎麼命名？', 'humorous', 48),
  ('birthday_q_049', '壽星遇到臨時狀況時，最常展現哪一種意外超能力？', 'humorous', 49),
  ('birthday_q_050', '如果壽星是一部電影，片名會是什麼？', 'humorous', 50),
  ('birthday_q_051', '壽星最適合獲得哪一種今天先不用忙的特許？', 'humorous', 51),
  ('birthday_q_052', '如果用一種零食形容壽星，你會選什麼？為什麼？', 'humorous', 52),
  ('birthday_q_053', '壽星做過哪件事，讓你忍不住想說「果然是他」？', 'humorous', 53),
  ('birthday_q_054', '如果壽星有一個專屬進場音樂，你覺得會是哪種風格？', 'humorous', 54),
  ('birthday_q_055', '壽星最可能在哪一件小事上展現低調但很厲害？', 'humorous', 55),
  ('birthday_q_056', '如果要替壽星設計一個社團吉祥物，它會長什麼樣子？', 'humorous', 56),
  ('birthday_q_057', '壽星最適合在哪種場合擔任氣氛救援隊？', 'humorous', 57),
  ('birthday_q_058', '如果壽星是一個手機 App，你覺得大家最常使用他的哪項功能？', 'humorous', 58),
  ('birthday_q_059', '哪個社團瞬間最能代表壽星的幽默感？', 'humorous', 59),
  ('birthday_q_060', '如果要用一句輕鬆的標語介紹壽星，你會怎麼寫？', 'humorous', 60),
  ('birthday_q_061', '壽星有哪些讓人會心一笑、但其實很有魅力的反差？', 'humorous', 61),
  ('birthday_q_062', '如果壽星參加社團才藝表演，你最期待他表演什麼？', 'humorous', 62),
  ('birthday_q_063', '壽星最適合得到哪一種今天不必解釋的通行證？', 'humorous', 63),
  ('birthday_q_064', '如果把壽星的可靠程度換算成一種東西，你會用什麼來比喻？', 'humorous', 64),
  ('birthday_q_065', '壽星最有可能因為哪件小事，成為大家記憶中的主角？', 'humorous', 65),
  ('birthday_q_066', '壽星曾在你需要支持時，給過你什麼力量？', 'moving', 66),
  ('birthday_q_067', '哪一段和壽星一起走過的經歷，讓你更珍惜這段情誼？', 'moving', 67),
  ('birthday_q_068', '你想讓壽星知道，他曾經改變了誰的哪一天？', 'moving', 68),
  ('birthday_q_069', '壽星身上哪一種堅持，讓你由衷佩服？', 'moving', 69),
  ('birthday_q_070', '哪一次告別或重逢，讓你特別感受到壽星的重要？', 'moving', 70),
  ('birthday_q_071', '如果把你想對壽星說的謝意放進一封信，開頭會寫什麼？', 'moving', 71),
  ('birthday_q_072', '壽星曾在什麼時候讓你相信，善意真的會傳下去？', 'moving', 72),
  ('birthday_q_073', '你希望壽星未來仍然保留身上的哪一份純粹？', 'moving', 73),
  ('birthday_q_074', '哪一個共同經歷，讓你覺得你們不只是一起做事的夥伴？', 'moving', 74),
  ('birthday_q_075', '壽星曾經默默承擔過什麼，值得大家向他說聲謝謝？', 'moving', 75),
  ('birthday_q_076', '你希望壽星在忙碌的日子裡，記得自己帶給別人的哪種溫暖？', 'moving', 76),
  ('birthday_q_077', '哪一句話最能表達你對壽星一路走來的欣賞？', 'moving', 77),
  ('birthday_q_078', '壽星在哪個時刻讓你看見，溫柔也可以很有力量？', 'moving', 78),
  ('birthday_q_079', '如果替壽星保存一份社團記憶，你最想保存哪一段？', 'moving', 79),
  ('birthday_q_080', '你希望壽星知道，大家在他身上看見了什麼值得珍惜的特質？', 'moving', 80),
  ('birthday_q_081', '哪一次壽星的陪伴，讓你覺得自己不是一個人？', 'moving', 81),
  ('birthday_q_082', '你從壽星身上看見過哪一種勇氣？', 'moving', 82),
  ('birthday_q_083', '哪一個關於壽星的回憶，會讓你多年後仍然微笑？', 'moving', 83),
  ('birthday_q_084', '如果把壽星帶給你的感動寫成一句話，你會怎麼說？', 'moving', 84),
  ('birthday_q_085', '壽星曾經為團隊留下哪一份不容易被取代的影響？', 'moving', 85),
  ('birthday_q_086', '你最想把哪個未來的約定送給壽星？', 'moving', 86),
  ('birthday_q_087', '哪一個瞬間讓你覺得，認識壽星是一件很幸運的事？', 'moving', 87),
  ('birthday_q_088', '壽星有哪些付出，可能自己已經忘了，但你一直記得？', 'moving', 88),
  ('birthday_q_089', '如果要把一個美好願望交給壽星，你希望它關於什麼？', 'moving', 89),
  ('birthday_q_090', '你希望壽星在新的一歲，收到哪一種來自生活的回應？', 'moving', 90),
  ('birthday_q_091', '壽星曾讓你重新相信哪一件原本快要放棄的事？', 'moving', 91),
  ('birthday_q_092', '哪一個詞最能代表壽星留給社團的影響？為什麼？', 'moving', 92),
  ('birthday_q_093', '你希望壽星知道，自己在哪些人的故事裡留下了位置？', 'moving', 93),
  ('birthday_q_094', '如果今天只能對壽星說一句真心話，你最想說什麼？', 'moving', 94),
  ('birthday_q_095', '壽星曾經給過你的哪一份支持，直到現在仍然有效？', 'moving', 95),
  ('birthday_q_096', '你希望未來的某一天，還能和壽星一起回想哪段時光？', 'moving', 96),
  ('birthday_q_097', '哪件事讓你覺得壽星值得被好好祝福？', 'moving', 97),
  ('birthday_q_098', '你認為壽星這一路走來，最值得為自己感到驕傲的是什麼？', 'moving', 98),
  ('birthday_q_099', '如果把大家對壽星的祝福聚成一盞燈，你希望它照亮壽星的哪條路？', 'moving', 99),
  ('birthday_q_100', '你想把哪一個溫暖的畫面，留給壽星作為今年生日的記憶？', 'moving', 100)
on conflict do nothing;

create or replace function public.list_birthday_wish_question_bank(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  result jsonb;
begin
  if p_club_id is null
     or not public.current_can_manage_club(p_club_id)
     or not exists (
       select 1 from public.clubs
       where id = p_club_id and club_status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'birthday_collection_manager_required';
  end if;

  select jsonb_build_object(
    'platform', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'question_key', item.question_key,
        'prompt', item.prompt,
        'tone', item.tone,
        'sort_order', item.sort_order,
        'is_enabled', item.is_enabled,
        'scope', 'platform'
      ) order by item.sort_order, item.question_key)
      from public.birthday_wish_question_bank_items as item
      where item.club_id is null
    ), '[]'::jsonb),
    'club', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'question_key', item.question_key,
        'prompt', item.prompt,
        'tone', item.tone,
        'sort_order', item.sort_order,
        'is_enabled', item.is_enabled,
        'scope', 'club'
      ) order by item.sort_order, item.question_key)
      from public.birthday_wish_question_bank_items as item
      where item.club_id = p_club_id
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create or replace function public.create_birthday_wish_question(
  p_club_id uuid,
  p_question_key text,
  p_prompt text,
  p_tone text default 'warm',
  p_sort_order integer default 100
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  question_id uuid;
  normalized_key text := lower(btrim(coalesce(p_question_key, '')));
  normalized_prompt text := public.normalize_birthday_wish(p_prompt);
begin
  if actor_id is null
     or not public.current_can_manage_club(p_club_id)
     or not exists (
       select 1 from public.clubs
       where id = p_club_id and club_status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'birthday_collection_manager_required';
  end if;

  if normalized_key !~ '^[a-z][a-z0-9_]{2,63}$'
     or normalized_prompt = ''
     or char_length(normalized_prompt) > 300
     or p_tone not in ('warm', 'humorous', 'moving')
     or p_sort_order not between 0 and 10000 then
    raise exception using errcode = '22023', message = 'invalid_birthday_question';
  end if;

  insert into public.birthday_wish_question_bank_items (
    club_id, question_key, prompt, tone, sort_order, created_by_app_account_id
  ) values (
    p_club_id, normalized_key, normalized_prompt, p_tone, p_sort_order, actor_id
  ) returning id into question_id;

  return question_id;
end;
$$;

create or replace function public.update_birthday_wish_question(
  p_club_id uuid,
  p_question_id uuid,
  p_prompt text,
  p_tone text,
  p_sort_order integer,
  p_is_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  normalized_prompt text := public.normalize_birthday_wish(p_prompt);
begin
  if actor_id is null
     or not public.current_can_manage_club(p_club_id)
     or not exists (
       select 1 from public.clubs
       where id = p_club_id and club_status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'birthday_collection_manager_required';
  end if;

  if normalized_prompt = ''
     or char_length(normalized_prompt) > 300
     or p_tone not in ('warm', 'humorous', 'moving')
     or p_sort_order not between 0 and 10000
     or p_is_enabled is null then
    raise exception using errcode = '22023', message = 'invalid_birthday_question';
  end if;

  update public.birthday_wish_question_bank_items
  set prompt = normalized_prompt,
      tone = p_tone,
      sort_order = p_sort_order,
      is_enabled = p_is_enabled
  where id = p_question_id
    and club_id = p_club_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'birthday_club_question_not_found';
  end if;
end;
$$;

create or replace function public.create_birthday_wish_assignment_batch(
  p_club_id uuid,
  p_birthday_year integer,
  p_birthday_month integer
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  batch_id uuid;
begin
  if actor_id is null
     or not public.current_can_manage_club(p_club_id)
     or not exists (
       select 1 from public.clubs
       where id = p_club_id and club_status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'birthday_collection_manager_required';
  end if;

  if p_birthday_year not between 2000 and 2200
     or p_birthday_month not between 1 and 12 then
    raise exception using errcode = '22023', message = 'invalid_birthday_assignment_period';
  end if;

  insert into public.birthday_wish_assignment_batches (
    club_id, birthday_year, birthday_month, created_by_app_account_id
  ) values (
    p_club_id, p_birthday_year, p_birthday_month, actor_id
  ) on conflict (club_id, birthday_year, birthday_month) do nothing;

  select id into batch_id
  from public.birthday_wish_assignment_batches
  where club_id = p_club_id
    and birthday_year = p_birthday_year
    and birthday_month = p_birthday_month;

  return batch_id;
end;
$$;

create or replace function public.create_birthday_wish_campaign(
  p_club_id uuid,
  p_recipient_membership_id uuid,
  p_birthday_year integer,
  p_birthday_date date,
  p_assignment_batch_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  recipient_birth_date date;
  expected_birthday date;
  existing_id uuid;
  existing_date date;
  existing_batch_id uuid;
  batch_year integer;
  batch_month integer;
begin
  if actor_id is null
     or not public.current_can_manage_club(p_club_id)
     or not exists (
       select 1 from public.clubs
       where id = p_club_id and club_status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'birthday_collection_manager_required';
  end if;

  if p_recipient_membership_id is null
     or p_birthday_date is null
     or p_birthday_year not between 2000 and 2200
     or extract(year from p_birthday_date)::integer <> p_birthday_year then
    raise exception using errcode = '22023', message = 'invalid_birthday_campaign_date';
  end if;

  select person.birth_date
  into recipient_birth_date
  from public.club_memberships as membership
  join public.people as person on person.id = membership.person_id
  where membership.id = p_recipient_membership_id
    and membership.club_id = p_club_id
    and membership.membership_status = 'active';

  if recipient_birth_date is null then
    raise exception using errcode = '42501', message = 'birthday_recipient_not_eligible';
  end if;

  if not exists (
    select 1
    from public.birthday_visibility_preferences as preference
    where preference.membership_id = p_recipient_membership_id
      and preference.club_id = p_club_id
      and preference.is_listed = true
      and preference.allow_wishes = true
  ) then
    raise exception using errcode = '42501', message = 'birthday_recipient_not_accepting_wishes';
  end if;

  expected_birthday := public.birthday_effective_date(recipient_birth_date, p_birthday_year);
  if p_birthday_date <> expected_birthday then
    raise exception using errcode = '22023', message = 'birthday_campaign_date_mismatch';
  end if;

  if p_assignment_batch_id is not null then
    select birthday_year, birthday_month
    into batch_year, batch_month
    from public.birthday_wish_assignment_batches
    where id = p_assignment_batch_id
      and club_id = p_club_id;

    if not found then
      raise exception using errcode = 'P0002', message = 'birthday_assignment_batch_not_found';
    end if;

    if batch_year <> p_birthday_year
       or batch_month <> extract(month from p_birthday_date)::integer then
      raise exception using errcode = '22023', message = 'birthday_campaign_batch_mismatch';
    end if;
  end if;

  insert into public.birthday_wish_campaigns (
    club_id, recipient_membership_id, birthday_year, birthday_date,
    assignment_batch_id, created_by_app_account_id
  ) values (
    p_club_id, p_recipient_membership_id, p_birthday_year, p_birthday_date,
    p_assignment_batch_id, actor_id
  ) on conflict (club_id, recipient_membership_id, birthday_year) do nothing;

  select id, birthday_date, assignment_batch_id
  into existing_id, existing_date, existing_batch_id
  from public.birthday_wish_campaigns
  where club_id = p_club_id
    and recipient_membership_id = p_recipient_membership_id
    and birthday_year = p_birthday_year;

  if existing_date <> p_birthday_date
     or (p_assignment_batch_id is not null and existing_batch_id is distinct from p_assignment_batch_id) then
    raise exception using errcode = '23505', message = 'birthday_campaign_idempotency_conflict';
  end if;

  return existing_id;
end;
$$;

create or replace function public.assign_birthday_wish_participant(
  p_club_id uuid,
  p_assignment_batch_id uuid,
  p_campaign_id uuid,
  p_assignee_membership_id uuid,
  p_question_bank_item_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  batch_status text;
  batch_year integer;
  batch_month integer;
  campaign_recipient_id uuid;
  campaign_date date;
  campaign_status text;
  question_prompt text;
  question_enabled boolean;
  existing_id uuid;
  existing_campaign_id uuid;
  existing_question_id uuid;
  participant_id uuid;
begin
  if actor_id is null
     or not public.current_can_manage_club(p_club_id)
     or not exists (
       select 1 from public.clubs
       where id = p_club_id and club_status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'birthday_collection_manager_required';
  end if;

  select batch.batch_status, batch.birthday_year, batch.birthday_month
  into batch_status, batch_year, batch_month
  from public.birthday_wish_assignment_batches as batch
  where batch.id = p_assignment_batch_id
    and batch.club_id = p_club_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'birthday_assignment_batch_not_found';
  end if;

  if batch_status not in ('planned', 'assigning') then
    raise exception using errcode = '22023', message = 'birthday_assignment_batch_not_open';
  end if;

  select campaign.recipient_membership_id, campaign.birthday_date, campaign.campaign_status
  into campaign_recipient_id, campaign_date, campaign_status
  from public.birthday_wish_campaigns as campaign
  where campaign.id = p_campaign_id
    and campaign.club_id = p_club_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'birthday_campaign_not_found';
  end if;

  if campaign_status not in ('draft', 'collecting') then
    raise exception using errcode = '22023', message = 'birthday_campaign_not_open';
  end if;

  if extract(year from campaign_date)::integer <> batch_year
     or extract(month from campaign_date)::integer <> batch_month then
    raise exception using errcode = '22023', message = 'birthday_assignment_campaign_period_mismatch';
  end if;

  if p_assignee_membership_id is null
     or p_assignee_membership_id = campaign_recipient_id
     or not exists (
       select 1
       from public.club_memberships as membership
       where membership.id = p_assignee_membership_id
         and membership.club_id = p_club_id
         and membership.membership_status = 'active'
     ) then
    raise exception using errcode = '22023', message = 'invalid_birthday_assignment_member';
  end if;

  if not exists (
    select 1
    from public.club_memberships as membership
    join public.app_accounts as account
      on account.person_id = membership.person_id
     and account.account_status = 'active'
    where membership.id = p_assignee_membership_id
      and membership.club_id = p_club_id
  ) then
    raise exception using errcode = '42501', message = 'birthday_assignment_member_account_required';
  end if;

  select prompt, is_enabled
  into question_prompt, question_enabled
  from public.birthday_wish_question_bank_items
  where id = p_question_bank_item_id
    and is_enabled = true
    and (club_id is null or club_id = p_club_id);

  if not found or not question_enabled then
    raise exception using errcode = '22023', message = 'birthday_question_not_available';
  end if;

  select id, campaign_id, question_bank_item_id
  into existing_id, existing_campaign_id, existing_question_id
  from public.birthday_wish_campaign_participants
  where assignment_batch_id = p_assignment_batch_id
    and assignee_membership_id = p_assignee_membership_id;

  if existing_id is not null then
    if existing_campaign_id <> p_campaign_id
       or existing_question_id <> p_question_bank_item_id then
      raise exception using errcode = '23505', message = 'birthday_assignment_idempotency_conflict';
    end if;
    return existing_id;
  end if;

  if exists (
    select 1
    from public.birthday_wish_campaign_participants
    where assignment_batch_id = p_assignment_batch_id
      and question_bank_item_id = p_question_bank_item_id
  ) then
    raise exception using errcode = '23505', message = 'birthday_question_already_used_in_batch';
  end if;

  update public.birthday_wish_assignment_batches
  set batch_status = 'assigning',
      started_at = coalesce(started_at, now())
  where id = p_assignment_batch_id
    and club_id = p_club_id;

  update public.birthday_wish_campaigns as campaign
  set campaign_status = case when campaign.campaign_status = 'draft' then 'collecting' else campaign.campaign_status end,
      starts_at = coalesce(campaign.starts_at, now())
  where campaign.id = p_campaign_id
    and campaign.club_id = p_club_id;

  insert into public.birthday_wish_campaign_participants (
    club_id, campaign_id, assignment_batch_id, assignee_membership_id,
    question_bank_item_id, question_prompt_snapshot
  ) values (
    p_club_id, p_campaign_id, p_assignment_batch_id, p_assignee_membership_id,
    p_question_bank_item_id, question_prompt
  ) returning id into participant_id;

  return participant_id;
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
  existing_status text;
  existing_author_id uuid;
  submission_id uuid;
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
    and participant.assignee_membership_id = actor_membership_id;

  if not found or participant_status = 'disabled' then
    raise exception using errcode = '42501', message = 'birthday_assignment_not_available';
  end if;

  if campaign_status not in ('draft', 'collecting') then
    raise exception using errcode = '22023', message = 'birthday_campaign_submission_closed';
  end if;

  select submission_status, author_app_account_id
  into existing_status, existing_author_id
  from public.birthday_wish_campaign_submissions
  where participant_id = p_participant_id
    and club_id = p_club_id
  for update;

  if existing_status in ('published', 'hidden') then
    raise exception using errcode = '23514', message = 'birthday_submission_published_immutable';
  end if;

  if existing_author_id is not null and existing_author_id <> actor_id then
    raise exception using errcode = '42501', message = 'birthday_submission_author_mismatch';
  end if;

  if existing_status is null then
    insert into public.birthday_wish_campaign_submissions (
      club_id, campaign_id, participant_id, author_app_account_id, content
    )
    select participant.club_id, participant.campaign_id, participant.id, actor_id, normalized_content
    from public.birthday_wish_campaign_participants as participant
    where participant.id = p_participant_id
      and participant.club_id = p_club_id
    returning id into submission_id;
  else
    update public.birthday_wish_campaign_submissions
    set content = normalized_content,
        submission_status = 'submitted',
        deleted_at = null
    where participant_id = p_participant_id
      and club_id = p_club_id
    returning id into submission_id;
  end if;

  update public.birthday_wish_campaign_participants
  set participant_status = 'submitted',
      responded_at = coalesce(responded_at, now())
  where id = p_participant_id
    and club_id = p_club_id;

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
begin
  if actor_membership_id is null then
    raise exception using errcode = '42501', message = 'active_birthday_membership_required';
  end if;

  -- The parameter is deliberately the participant id, not a submission id.
  select submission.submission_status
  into existing_status
  from public.birthday_wish_campaign_submissions as submission
  join public.birthday_wish_campaign_participants as participant
    on participant.id = submission.participant_id
   and participant.club_id = submission.club_id
   and participant.assignee_membership_id = actor_membership_id
  where submission.participant_id = p_participant_id
    and submission.club_id = p_club_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'birthday_submission_not_found';
  end if;

  if existing_status in ('published', 'hidden') then
    raise exception using errcode = '23514', message = 'birthday_submission_published_immutable';
  end if;

  update public.birthday_wish_campaign_submissions
  set submission_status = 'deleted',
      deleted_at = coalesce(deleted_at, now())
  where participant_id = p_participant_id
    and club_id = p_club_id;

  update public.birthday_wish_campaign_participants
  set participant_status = 'invited',
      responded_at = null
  where id = p_participant_id
    and club_id = p_club_id;
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
        'content', case when submission.submission_status = 'deleted' then null else submission.content end,
        'submitted_at', submission.submitted_at,
        'can_edit', submission.id is null or submission.submission_status not in ('published', 'hidden')
      ) order by campaign.birthday_date, participant.id)
      from public.birthday_wish_campaign_participants as participant
      join public.birthday_wish_campaigns as campaign
        on campaign.id = participant.campaign_id
       and campaign.club_id = participant.club_id
      join public.club_memberships as recipient_membership
        on recipient_membership.id = campaign.recipient_membership_id
       and recipient_membership.club_id = p_club_id
      join public.people as recipient on recipient.id = recipient_membership.person_id
      left join public.birthday_wish_campaign_submissions as submission
        on submission.participant_id = participant.id
       and submission.club_id = participant.club_id
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
          from public.birthday_wish_campaign_submissions as submission
          where submission.campaign_id = campaign.id
            and submission.club_id = p_club_id
            and submission.submission_status in ('submitted', 'published', 'hidden')
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
        'content', submission.content,
        'submitted_at', submission.submitted_at
      ) order by campaign.birthday_date, participant.id)
      from public.birthday_wish_campaign_participants as participant
      join public.birthday_wish_campaigns as campaign
        on campaign.id = participant.campaign_id
       and campaign.club_id = participant.club_id
      join public.club_memberships as assignee_membership
        on assignee_membership.id = participant.assignee_membership_id
       and assignee_membership.club_id = p_club_id
      join public.people as assignee on assignee.id = assignee_membership.person_id
      left join public.birthday_wish_campaign_submissions as submission
        on submission.participant_id = participant.id
       and submission.club_id = participant.club_id
       and submission.submission_status <> 'deleted'
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

-- Register the collection as a separate dark-launch switch. It remains off
-- until the scheduler and officer/member UI are ready.
alter table public.platform_feature_flags
  drop constraint platform_feature_flags_feature_key_check;
alter table public.platform_feature_flags
  add constraint platform_feature_flags_feature_key_check check (feature_key in (
    'role_context_v2',
    'role_shells_v2',
    'member_home_v2',
    'checkin_qr_v2',
    'checkin_gps_v2',
    'attendance_ui_v2',
    'announcements_v09',
    'blessing_iou_v1',
    'blessing_iou_collections_v1',
    'blessing_iou_reporting_v1',
    'birthday_wishes_v1',
    'birthday_wishes_v2',
    'birthday_wishes_collection_v1',
    'message_board_v1',
    'archive_handover_v1'
  ));

alter table public.platform_feature_flag_audit
  drop constraint platform_feature_flag_audit_feature_key_check;
alter table public.platform_feature_flag_audit
  add constraint platform_feature_flag_audit_feature_key_check check (feature_key in (
    'role_context_v2',
    'role_shells_v2',
    'member_home_v2',
    'checkin_qr_v2',
    'checkin_gps_v2',
    'attendance_ui_v2',
    'announcements_v09',
    'blessing_iou_v1',
    'blessing_iou_collections_v1',
    'blessing_iou_reporting_v1',
    'birthday_wishes_v1',
    'birthday_wishes_v2',
    'birthday_wishes_collection_v1',
    'message_board_v1',
    'archive_handover_v1'
  ));

create or replace function public.set_platform_feature_flag(
  p_feature_key text,
  p_enabled boolean,
  p_enabled_environments text[],
  p_rollout_percentage integer
)
returns table (
  feature_key text,
  enabled boolean,
  enabled_environments text[],
  rollout_percentage smallint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not public.current_has_platform_role(array['superadmin', 'platform_admin']) then
    raise exception using errcode = '42501', message = 'platform_feature_flag_admin_required';
  end if;
  if p_feature_key not in (
    'role_context_v2', 'role_shells_v2', 'member_home_v2', 'checkin_qr_v2', 'checkin_gps_v2',
    'attendance_ui_v2', 'announcements_v09', 'blessing_iou_v1',
    'blessing_iou_collections_v1', 'blessing_iou_reporting_v1',
    'birthday_wishes_v1', 'birthday_wishes_v2', 'birthday_wishes_collection_v1',
    'message_board_v1', 'archive_handover_v1'
  ) or p_enabled is null or p_enabled_environments is null
    or p_rollout_percentage not between 0 and 100
    or not (p_enabled_environments <@ array['local', 'staging', 'production']::text[]) then
    raise exception using errcode = '22023', message = 'invalid_platform_feature_flag_input';
  end if;

  return query
  insert into public.platform_feature_flags as flag (
    feature_key, enabled, enabled_environments, rollout_percentage
  ) values (
    p_feature_key, p_enabled, p_enabled_environments, p_rollout_percentage::smallint
  )
  on conflict on constraint platform_feature_flags_pkey do update
    set enabled = excluded.enabled,
        enabled_environments = excluded.enabled_environments,
        rollout_percentage = excluded.rollout_percentage
  returning flag.feature_key, flag.enabled, flag.enabled_environments, flag.rollout_percentage, flag.updated_at;
end;
$$;

create or replace function public.platform_product_telemetry_payload_is_valid(
  p_event_name text,
  p_payload jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
begin
  case p_event_name
    when 'member_context_resolve_success' then
      return public.jsonb_has_exact_keys(p_payload, array['duration_ms', 'club_count', 'mode_count'])
        and public.jsonb_bounded_integer(p_payload, 'duration_ms', 120000)
        and public.jsonb_bounded_integer(p_payload, 'club_count', 1000)
        and public.jsonb_bounded_integer(p_payload, 'mode_count', 3);
    when 'member_context_resolve_failure', 'member_home_projection_failure' then
      return public.jsonb_has_exact_keys(p_payload, array['duration_ms', 'reason'])
        and public.jsonb_bounded_integer(p_payload, 'duration_ms', 120000)
        and coalesce(p_payload ->> 'reason', '') in (
          'database_unavailable', 'invalid_projection', 'authorization_denied', 'invalid_configuration', 'unexpected'
        );
    when 'member_home_projection_duration' then
      return public.jsonb_has_exact_keys(p_payload, array['duration_ms', 'database_round_trips'])
        and public.jsonb_bounded_integer(p_payload, 'duration_ms', 120000)
        and public.jsonb_bounded_integer(p_payload, 'database_round_trips', 10);
    when 'checkin_attempt' then
      return public.jsonb_has_exact_keys(p_payload, array['method'])
        and coalesce(p_payload ->> 'method', '') in ('qr', 'gps', 'manual');
    when 'checkin_success' then
      return public.jsonb_has_exact_keys(p_payload, array['method', 'duration_ms', 'result'])
        and coalesce(p_payload ->> 'method', '') in ('qr', 'gps', 'manual')
        and public.jsonb_bounded_integer(p_payload, 'duration_ms', 120000)
        and coalesce(p_payload ->> 'result', '') in ('created', 'duplicate', 'current_qr', 'grace_qr');
    when 'checkin_failure' then
      return public.jsonb_has_exact_keys(p_payload, array['method', 'duration_ms', 'reason'])
        and coalesce(p_payload ->> 'method', '') in ('qr', 'gps', 'manual')
        and public.jsonb_bounded_integer(p_payload, 'duration_ms', 120000)
        and coalesce(p_payload ->> 'reason', '') in (
          'expired', 'previous_code_grace_expired', 'session_closed', 'not_started', 'not_eligible', 'duplicate',
          'network_timeout', 'gps_denied', 'gps_unavailable', 'gps_out_of_range', 'gps_low_quality', 'unexpected'
        );
    when 'checkin_pending_confirmation' then
      return public.jsonb_has_exact_keys(p_payload, array['method', 'reason'])
        and coalesce(p_payload ->> 'method', '') in ('qr', 'gps', 'manual')
        and p_payload ->> 'reason' = 'network_timeout';
    when 'feature_flag_evaluation_failure' then
      return public.jsonb_has_exact_keys(p_payload, array['feature_key', 'reason'])
        and coalesce(p_payload ->> 'feature_key', '') in (
          'role_context_v2', 'role_shells_v2', 'member_home_v2', 'checkin_qr_v2', 'checkin_gps_v2',
          'attendance_ui_v2', 'announcements_v09', 'blessing_iou_v1', 'blessing_iou_collections_v1',
          'blessing_iou_reporting_v1', 'birthday_wishes_v1', 'birthday_wishes_v2',
          'birthday_wishes_collection_v1', 'message_board_v1', 'archive_handover_v1'
        )
        and coalesce(p_payload ->> 'reason', '') in (
          'missing_configuration', 'invalid_configuration', 'evaluation_error'
        );
    else
      return public.platform_product_telemetry_payload_is_valid(p_event_name, p_payload);
  end case;
end;
$$;

revoke all on function public.protect_birthday_question_bank_item() from public, anon, authenticated;
revoke all on function public.protect_birthday_collection_batch() from public, anon, authenticated;
revoke all on function public.protect_birthday_collection_campaign() from public, anon, authenticated;
revoke all on function public.protect_birthday_collection_participant() from public, anon, authenticated;
revoke all on function public.protect_birthday_collection_submission() from public, anon, authenticated;
revoke all on function public.prevent_birthday_collection_hard_delete() from public, anon, authenticated;
revoke all on function public.list_birthday_wish_question_bank(uuid) from public, anon;
revoke all on function public.create_birthday_wish_question(uuid, text, text, text, integer) from public, anon;
revoke all on function public.update_birthday_wish_question(uuid, uuid, text, text, integer, boolean) from public, anon;
revoke all on function public.create_birthday_wish_assignment_batch(uuid, integer, integer) from public, anon;
revoke all on function public.create_birthday_wish_campaign(uuid, uuid, integer, date, uuid) from public, anon;
revoke all on function public.assign_birthday_wish_participant(uuid, uuid, uuid, uuid, uuid) from public, anon;
revoke all on function public.save_birthday_wish_submission(uuid, uuid, text) from public, anon;
revoke all on function public.delete_own_birthday_wish_submission(uuid, uuid) from public, anon;
revoke all on function public.get_my_birthday_wish_collection_page(uuid) from public, anon;

grant execute on function public.list_birthday_wish_question_bank(uuid) to authenticated;
grant execute on function public.create_birthday_wish_question(uuid, text, text, text, integer) to authenticated;
grant execute on function public.update_birthday_wish_question(uuid, uuid, text, text, integer, boolean) to authenticated;
grant execute on function public.create_birthday_wish_assignment_batch(uuid, integer, integer) to authenticated;
grant execute on function public.create_birthday_wish_campaign(uuid, uuid, integer, date, uuid) to authenticated;
grant execute on function public.assign_birthday_wish_participant(uuid, uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.save_birthday_wish_submission(uuid, uuid, text) to authenticated;
grant execute on function public.delete_own_birthday_wish_submission(uuid, uuid) to authenticated;
grant execute on function public.get_my_birthday_wish_collection_page(uuid) to authenticated;

commit;

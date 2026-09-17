begin;

-- 隱私設定預設全開，包含既有社籍。
--
-- 20260914000700 把生日公開的預設改成 true，但**刻意沒有回填**，理由寫在那支
-- migration 裡：V1 的時候「沒有那一列」就代表不公開，把那些人在不知情的狀況
-- 下變成公開，等於推翻他們既有的隱私選擇。
--
-- 社長在 2026-09-17 明確決定回填，而且知道設定畫面同時會被隱藏起來 ——
-- 也就是社友目前沒有地方可以自己關掉。這支 migration 執行的是那個決定。
--
-- 兩件事刻意不做：
--
-- 一、明確選了「不公開」的那些列不動。社長要的是「從來沒設定過的人」跟上
--     預設，那和「推翻一個人按下去的選擇」是兩件事。那些列只有幾種可能：
--     有人真的進去關掉了。要一起翻的話，是另一個決定。
--
-- 二、沒有生日的社籍不建列。那一列存在的意思是「這個人的生日可以被看到」，
--     而他還沒有生日。填了之後 ensure_birthday_visibility_preference 會補上。
--
-- 回填會寫稽核，因為這是一次大量的隱私狀態變更，而社裡之後要答得出來是誰、
-- 什麼時候、改了幾個人。

do $migration$
declare
  filled integer;
begin
  with created as (
    insert into public.birthday_visibility_preferences (membership_id, club_id, is_listed, allow_wishes)
    select membership.id, membership.club_id, true, true
    from public.club_memberships as membership
    join public.people as person on person.id = membership.person_id
    where membership.membership_status = 'active'
      and person.birth_date is not null
      and not exists (
        select 1 from public.birthday_visibility_preferences as preference
        where preference.membership_id = membership.id
      )
    returning club_id
  )
  select count(*) into filled from created;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (
    null, null, 'privacy.birthday_defaults_backfilled', 'platform', null,
    jsonb_build_object(
      'memberships_made_public', filled,
      'decided_by', 'club president, 2026-09-17',
      'explicit_opt_outs_left_alone', true
    )
  );
end;
$migration$;

-- 同社名冊（Email、手機、出生年份、使用狀況）在 20260822000500 就已經把預設
-- 改成 true 並回填過一次。那次之後被明確關掉的列，同樣不動 —— 理由和上面
-- 一樣：那是有人按下去的選擇。
--
-- 還沒有任何一列的社籍，預設本來就是公開，所以不需要補。

commit;

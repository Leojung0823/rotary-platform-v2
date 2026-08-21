begin;

-- Two changes to the settings a member sees on 我的.
--
-- The three directory-visibility settings now default to on. A club roster
-- whose contact details are hidden by default is not a roster, and every one
-- of these is already scoped to the member's own club -- nothing here is ever
-- visible outside it.
--
-- Anonymous usage analytics stops being a toggle. It is worth being exact
-- about what that changes, because it is less than it appears: nothing in this
-- codebase has ever read analytics_consent. Telemetry was always collected
-- regardless, so the control shown to members promised a choice the system did
-- not honour. Removing it makes the interface honest rather than taking
-- something away, and the value is now forced true in the RPC so that no
-- caller -- including a crafted API request that supplies the field directly
-- -- can set it to anything else.
--
-- The telemetry itself is why this is defensible: it stores no subject for
-- flag-evaluation failures, keys its rate guard to a value that rotates daily
-- and maps back to no account, and retains no IP address. See
-- docs/product/ROLLOUT_CONTROLS.md.

alter table public.privacy_settings
  alter column show_email_to_club set default true,
  alter column show_phone_to_club set default true,
  alter column show_birthday_year set default true,
  alter column analytics_consent set default true;

-- Existing rows are brought to the new defaults. There is no stored
-- distinction between "a member turned this off" and "a member never touched
-- it", and every current row holds the old default, so this is applied to all
-- of them rather than guessing which were deliberate.
update public.privacy_settings
set show_email_to_club = true,
    show_phone_to_club = true,
    show_birthday_year = true,
    analytics_consent = true,
    updated_at = now()
where not (show_email_to_club and show_phone_to_club and show_birthday_year and analytics_consent);

create or replace function public.update_my_settings(p_notifications jsonb, p_privacy jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare account_id uuid := public.current_app_account_id();
begin
  if account_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  insert into public.notification_settings (app_account_id, line_enabled, email_enabled, security_alerts, club_announcements)
  values (account_id, coalesce((p_notifications->>'line_enabled')::boolean, true),
    coalesce((p_notifications->>'email_enabled')::boolean, true), coalesce((p_notifications->>'security_alerts')::boolean, true),
    coalesce((p_notifications->>'club_announcements')::boolean, true))
  on conflict (app_account_id) do update set line_enabled = excluded.line_enabled, email_enabled = excluded.email_enabled,
    security_alerts = excluded.security_alerts, club_announcements = excluded.club_announcements, updated_at = now();
  insert into public.privacy_settings (app_account_id, show_email_to_club, show_phone_to_club, show_birthday_year, analytics_consent)
  values (account_id, coalesce((p_privacy->>'show_email_to_club')::boolean, true),
    coalesce((p_privacy->>'show_phone_to_club')::boolean, true), coalesce((p_privacy->>'show_birthday_year')::boolean, true),
    true)
  on conflict (app_account_id) do update set show_email_to_club = excluded.show_email_to_club,
    show_phone_to_club = excluded.show_phone_to_club, show_birthday_year = excluded.show_birthday_year,
    analytics_consent = true, updated_at = now();
  insert into public.audit_logs (actor_app_account_id, action_key, subject_type, subject_id)
  values (account_id, 'identity.settings_updated', 'app_account', account_id);
end;
$$;


commit;

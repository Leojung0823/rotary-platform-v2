import Link from "next/link";
import { updateIdentitySettingsAction } from "@/app/actions";
import { Button, Notice } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

type Center = { privacy_settings: Record<string, boolean> | null; notification_settings: Record<string, boolean> | null };

export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const [query, supabase] = await Promise.all([searchParams, createClient()]); const result = await supabase.rpc("get_my_identity_center"); const center = result.data as Center | null;
  if (!center) return <Notice tone="error">設定暫時無法載入。</Notice>; const privacy = center.privacy_settings ?? {}; const notifications = center.notification_settings ?? {};
  return <div className="page-stack narrow"><Link className="back-link" href="/me">← 返回我的</Link><header><h1>聯絡資料顯示設定</h1><p>決定同社社員在名冊中可以看到哪些資料。</p></header>{query.success && <Notice tone="success">顯示設定已儲存。</Notice>}{query.error && <Notice tone="error">設定未完成，請再試一次。</Notice>}<section className="card"><form action={updateIdentitySettingsAction} className="form-stack"><input type="hidden" name="returnSection" value="privacy" />{Object.entries({ lineEnabled: notifications.line_enabled, emailEnabled: notifications.email_enabled, securityAlerts: notifications.security_alerts, clubAnnouncements: notifications.club_announcements }).map(([name, checked]) => checked !== false && <input key={name} type="hidden" name={name} value="on" />)}{[["showPhone", "顯示手機", privacy.show_phone_to_club], ["showEmail", "顯示 Email", privacy.show_email_to_club], ["showBirthYear", "顯示出生年份", privacy.show_birthday_year]].map(([name, label, checked]) => <label className="setting-toggle" key={String(name)}><span><strong>{String(label)}</strong><small>僅同社有效社員可查看</small></span><input type="checkbox" name={String(name)} defaultChecked={checked === true} /></label>)}{privacy.analytics_consent && <input type="hidden" name="analyticsConsent" value="on" />}<Button className="button-full" type="submit">儲存設定</Button></form></section></div>;
}

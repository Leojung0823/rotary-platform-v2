import Link from "next/link";
import { updateIdentitySettingsAction } from "@/app/actions";
import { Button, Notice } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

type Center = { privacy_settings: Record<string, boolean> | null; notification_settings: Record<string, boolean> | null };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const [query, supabase] = await Promise.all([searchParams, createClient()]); const result = await supabase.rpc("get_my_identity_center"); const center = result.data as Center | null;
  if (!center) return <Notice tone="error">設定暫時無法載入。</Notice>; const privacy = center.privacy_settings ?? {}; const notifications = center.notification_settings ?? {};
  return <div className="page-stack narrow"><Link className="back-link" href="/me">← 返回我的</Link><header><h1>通知設定</h1><p>選擇希望收到通知的方式與內容。</p></header>{query.success && <Notice tone="success">通知設定已儲存。</Notice>}{query.error && <Notice tone="error">設定未完成，請再試一次。</Notice>}<section className="card"><form action={updateIdentitySettingsAction} className="form-stack"><input type="hidden" name="returnSection" value="notifications" />{Object.entries({ showPhone: privacy.show_phone_to_club, showEmail: privacy.show_email_to_club, showBirthYear: privacy.show_birthday_year, analyticsConsent: privacy.analytics_consent }).map(([name, checked]) => checked === true && <input key={name} type="hidden" name={name} value="on" />)}{[["lineEnabled", "LINE 通知", notifications.line_enabled], ["emailEnabled", "Email 通知", notifications.email_enabled], ["clubAnnouncements", "扶輪社公告", notifications.club_announcements], ["securityAlerts", "帳號安全提醒", notifications.security_alerts]].map(([name, label, checked]) => <label className="setting-toggle" key={String(name)}><span><strong>{String(label)}</strong></span><input type="checkbox" name={String(name)} defaultChecked={checked !== false} /></label>)}<Button className="button-full" type="submit">儲存設定</Button></form></section></div>;
}

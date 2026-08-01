import { AppShell } from "@/components/app-shell";
import { requireIdentity } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const identity = await requireIdentity();
  const supabase = await createClient();
  const unreadResult = await supabase.rpc("get_my_unread_notification_count");
  const unreadCount = unreadResult.error ? 0 : Number(unreadResult.data ?? 0);
  return <AppShell identity={identity} unreadCount={unreadCount}>{children}</AppShell>;
}

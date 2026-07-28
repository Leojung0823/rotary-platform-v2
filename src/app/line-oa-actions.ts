"use server";

import { redirect } from "next/navigation";
import { sendLineOaMessage } from "@/lib/line/messaging";
import { readServerSecret } from "@/lib/line/oa-runtime";
import { createTrustedAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function errorPath(clubId: string, code: string) {
  return `/clubs/${clubId}/line-oa?error=${encodeURIComponent(code)}`;
}

export async function sendLineOaAction(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "");
  const text = String(formData.get("message") ?? "").trim();
  const requestedKind = String(formData.get("kind") ?? "broadcast");
  const kind: "broadcast" | "multicast" = requestedKind === "multicast" ? "multicast" : "broadcast";
  if (!text || text.length > 2000) redirect(errorPath(clubId, "unexpected"));

  const supabase = await createClient();
  const permissions = await supabase.rpc("list_my_permissions", { p_club_id: clubId });
  if (
    permissions.error ||
    !((permissions.data ?? []) as { permission_key: string }[]).some(
      (item) => item.permission_key === "oa.manage",
    )
  ) {
    redirect(errorPath(clubId, "forbidden"));
  }

  const admin = createTrustedAdminClient();
  const [accountResult, recipientsResult] = await Promise.all([
    admin
      .from("line_oa_accounts")
      .select("access_token_env_key")
      .eq("club_id", clubId)
      .neq("account_status", "disabled")
      .maybeSingle(),
    admin
      .from("line_oa_followers")
      .select("oa_user_id")
      .eq("club_id", clubId)
      .eq("follower_status", "following"),
  ]);

  if (accountResult.error || !accountResult.data || recipientsResult.error) {
    redirect(errorPath(clubId, "oa_not_configured"));
  }

  const recipients = (recipientsResult.data ?? []).map((row) => row.oa_user_id);
  let accessToken: string | undefined;
  try {
    if ((process.env.LINE_OA_MODE ?? "mock") === "line") {
      accessToken = readServerSecret(accountResult.data.access_token_env_key, "LINE OA access token");
    }
  } catch {
    redirect(errorPath(clubId, "oa_not_configured"));
  }

  let delivery: { status: "sent" | "mocked" | "failed"; requestId?: string };
  try {
    delivery = await sendLineOaMessage(kind, recipients, [{ type: "text", text }], { accessToken });
  } catch {
    delivery = { status: "failed" };
  }

  const logged = await supabase.rpc("record_line_push", {
    p_club_id: clubId,
    p_push_kind: kind,
    p_recipient_count: recipients.length,
    p_payload_summary: { message_type: "text", character_count: text.length },
    p_delivery_status: delivery.status,
    p_provider_request_id: delivery.requestId ?? null,
    p_failure_code: delivery.status === "failed" ? "provider_error" : null,
  });

  if (logged.error || delivery.status === "failed") redirect(errorPath(clubId, "unexpected"));
  redirect(`/clubs/${clubId}/line-oa?success=message_sent`);
}

"use server";

import { redirect } from "next/navigation";
import { createTrustedAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendLineOaMessage, type PushKind } from "@/lib/line/messaging";

function errorPath(path: string, code: string) {
  return `${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(code)}`;
}

function parsePushKind(value: FormDataEntryValue | null): Extract<PushKind, "broadcast" | "multicast"> | null {
  return value === "broadcast" || value === "multicast" ? value : null;
}

export async function sendClubLineOaAction(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "");
  const returnPath = `/clubs/${clubId}/line-oa`;
  const text = String(formData.get("message") ?? "").trim();
  const kind = parsePushKind(formData.get("kind"));
  if (!kind || !text || text.length > 2000) redirect(errorPath(returnPath, "unexpected"));

  const supabase = await createClient();
  const permissions = await supabase.rpc("list_my_permissions", { p_club_id: clubId });
  if (permissions.error || !((permissions.data ?? []) as { permission_key: string }[])
    .some((item) => item.permission_key === "oa.manage")) {
    redirect(errorPath(returnPath, "forbidden"));
  }

  const admin = createTrustedAdminClient();
  const accountResult = await admin.from("line_oa_accounts")
    .select("id, credential_ref")
    .eq("club_id", clubId)
    .neq("account_status", "disabled")
    .maybeSingle();
  if (accountResult.error || !accountResult.data) redirect(errorPath(returnPath, "unexpected"));

  const recipientsResult = await admin.from("line_oa_followers")
    .select("oa_user_id")
    .eq("line_oa_account_id", accountResult.data.id)
    .eq("club_id", clubId)
    .eq("follower_status", "following");
  if (recipientsResult.error) redirect(errorPath(returnPath, "unexpected"));

  const recipients = (recipientsResult.data ?? [])
    .map((row) => String(row.oa_user_id ?? ""))
    .filter(Boolean);
  if (kind === "multicast" && (recipients.length < 1 || recipients.length > 500)) {
    redirect(errorPath(returnPath, "unexpected"));
  }

  let delivery: { status: "mocked" | "sent" | "failed"; requestId?: string };
  try {
    delivery = await sendLineOaMessage(
      accountResult.data.credential_ref,
      kind,
      kind === "broadcast" ? [] : recipients,
      [{ type: "text", text }],
    );
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
  if (logged.error || delivery.status === "failed") redirect(errorPath(returnPath, "unexpected"));
  redirect(`${returnPath}?success=message_sent`);
}

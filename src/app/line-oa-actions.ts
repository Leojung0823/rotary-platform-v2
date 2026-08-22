"use server";

import { redirect } from "next/navigation";
import { sendLineOaMessage } from "@/lib/line/messaging";
import { readServerSecret } from "@/lib/line/oa-runtime";
import { createTrustedAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function errorPath(clubId: string, code: string) {
  return `/clubs/${clubId}/line-oa?error=${encodeURIComponent(code)}`;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function readUuidList(formData: FormData, name: string) {
  const values = formData.getAll(name).map((value) => String(value).trim());
  return Array.from(new Set(values.filter((value) => uuidPattern.test(value))));
}

export async function sendLineOaAction(formData: FormData) {
  const clubId = String(formData.get("clubId") ?? "");
  const text = String(formData.get("message") ?? "").trim();
  const requestedKind = String(formData.get("kind") ?? "broadcast");
  const audienceTagIds = readUuidList(formData, "audienceTagIds");
  const audienceMembershipIds = readUuidList(formData, "audienceMembershipIds");
  const targeted = audienceTagIds.length > 0 || audienceMembershipIds.length > 0;
  // A targeted message is a multicast by definition: broadcast reaches every
  // follower of the account, including people who are not the audience.
  const kind: "broadcast" | "multicast" = targeted || requestedKind === "multicast"
    ? "multicast"
    : "broadcast";
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

  let recipients = (recipientsResult.data ?? []).map((row) => row.oa_user_id);

  if (targeted) {
    // Resolved through the shared function so a tag means the same set of
    // people here as it does on an event or a post.
    const audience = await supabase.rpc("resolve_club_audience", {
      p_club_id: clubId,
      p_tag_ids: audienceTagIds,
      p_membership_ids: audienceMembershipIds,
    });
    if (audience.error) redirect(errorPath(clubId, "forbidden"));
    const resolved = (audience.data ?? {}) as { oa_user_ids?: unknown };
    const ids = Array.isArray(resolved.oa_user_ids)
      ? resolved.oa_user_ids.filter((id): id is string => typeof id === "string")
      : [];
    // Nobody in the audience has paired their account, so there is no one to
    // send to. Reported rather than silently recorded as a delivery of zero.
    if (ids.length === 0) redirect(errorPath(clubId, "audience_unreachable"));
    recipients = ids;
  }
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

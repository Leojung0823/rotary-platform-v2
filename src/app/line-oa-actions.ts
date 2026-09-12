"use server";

import { redirect } from "next/navigation";
import { buildPushLogArgs, deliverClubOaText, loadClubOaDispatchContext } from "@/lib/line/oa-dispatch";
import { createClient } from "@/lib/supabase/server";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { FLEX_TEMPLATES, buildClubFlexMessage, type FlexTemplate } from "@/lib/line/flex-templates";
import { buildFlexPushLogArgs, deliverClubOaFlex } from "@/lib/line/flex-dispatch";

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
  if (!uuidPattern.test(clubId)) redirect("/dashboard?error=invalid_input");
  const text = String(formData.get("message") ?? "").trim();
  const format = String(formData.get("messageFormat") ?? "text");
  const title = String(formData.get("messageTitle") ?? "").trim();
  if (format !== "text" && !Object.hasOwn(FLEX_TEMPLATES, format)) {
    redirect(errorPath(clubId, "invalid_flex_message"));
  }
  const template = format === "text" ? null : format as FlexTemplate;
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

  let senderName = "";
  if (template) {
    const [flag, account] = await Promise.all([
      evaluateCurrentFeatureFlag({ key: "line_oa_flex_templates_v1", subjectUuid: clubId }),
      supabase.rpc("get_line_oa_admin", { p_club_id: clubId }),
    ]);
    if (!flag.enabled) redirect(errorPath(clubId, "flex_templates_disabled"));
    if (account.error || !account.data?.account) redirect(errorPath(clubId, "oa_not_configured"));
    senderName = account.data.account.display_name;
    try {
      buildClubFlexMessage({ template, clubName: senderName, title, message: text });
    } catch {
      redirect(errorPath(clubId, "invalid_flex_message"));
    }
  }

  const dispatch = await loadClubOaDispatchContext(clubId);
  if (!dispatch.ok) redirect(errorPath(clubId, dispatch.reason));

  let recipients = dispatch.context.followers;

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

  const delivery = template
    ? await deliverClubOaFlex({ kind, recipients, context: dispatch.context, template, senderName, title, message: text })
    : await deliverClubOaText(kind, recipients, text, dispatch.context);
  const logged = await supabase.rpc(
    "record_line_push",
    template
      ? buildFlexPushLogArgs({ clubId, kind, recipientCount: recipients.length, template, message: text, title, delivery })
      : buildPushLogArgs(clubId, kind, recipients.length, text, delivery),
  );

  if (logged.error || delivery.status === "failed") {
    redirect(errorPath(clubId, delivery.failureCode ?? "unexpected"));
  }
  redirect(`/clubs/${clubId}/line-oa?success=message_sent`);
}

"use server";

import { redirect } from "next/navigation";
import { buildPushLogArgs, deliverClubOaText, loadClubOaDispatchContext } from "@/lib/line/oa-dispatch";
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

  const delivery = await deliverClubOaText(kind, recipients, text, dispatch.context);
  const logged = await supabase.rpc(
    "record_line_push",
    buildPushLogArgs(clubId, kind, recipients.length, text, delivery),
  );

  if (logged.error || delivery.status === "failed") {
    redirect(errorPath(clubId, delivery.failureCode ?? "unexpected"));
  }
  redirect(`/clubs/${clubId}/line-oa?success=message_sent`);
}

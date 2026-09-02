import { NextResponse, type NextRequest } from "next/server";
import { buildPushLogArgs, deliverClubOaText, loadClubOaDispatchContext } from "@/lib/line/oa-dispatch";
import { createClient } from "@/lib/supabase/server";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === request.nextUrl.origin || origin === process.env.NEXT_PUBLIC_SITE_URL;
}

function failure(status = 400) {
  return NextResponse.json({ error: "request_failed" }, { status });
}

async function authenticated() {
  const client = await createClient();
  const { data } = await client.auth.getUser();
  return { client, user: data.user };
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const { client, user } = await authenticated();
  if (!user) return failure(401);

  let result;
  if (path.join("/") === "me") result = await client.rpc("get_my_identity_center");
  else if (path[0] === "clubs" && path[2] === "members") {
    result = await client.rpc("list_club_members", {
      p_club_id: path[1],
      p_query: request.nextUrl.searchParams.get("q"),
      p_status: request.nextUrl.searchParams.get("status"),
    });
  } else if (path[0] === "clubs" && path[2] === "invitations") {
    result = await client.rpc("list_member_invitations", { p_club_id: path[1] });
  } else if (path[0] === "clubs" && path[2] === "dashboard") {
    result = await client.rpc("get_identity_dashboard", { p_club_id: path[1] });
  } else if (path[0] === "clubs" && path[2] === "audit") {
    result = await client.rpc("list_club_audit", { p_club_id: path[1], p_limit: 100 });
  } else if (path[0] === "clubs" && path[2] === "line-oa") {
    result = await client.rpc("get_line_oa_admin", { p_club_id: path[1] });
  } else return failure(404);

  return result.error ? failure(403) : NextResponse.json({ data: result.data });
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (!sameOrigin(request)) return failure(403);
  const { path } = await context.params;
  const { client, user } = await authenticated();
  if (!user) return failure(401);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return failure();

  let result;
  if (path[0] === "clubs" && path[2] === "members" && path.length === 3) {
    result = await client.rpc("create_member_invitation", {
      p_club_id: path[1],
      p_name: body.name,
      p_phone: body.phone ?? null,
      p_email: body.email ?? null,
      p_birth_date: body.birth_date ?? null,
      p_delivery_method: body.delivery_method ?? "link",
      p_idempotency_key: body.idempotency_key ?? crypto.randomUUID(),
    });
  } else if (path[0] === "invitations" && path[2] === "resend") {
    result = await client.rpc("resend_member_invitation", {
      p_invitation_id: path[1],
      p_delivery_method: body.delivery_method ?? "link",
    });
  } else if (path[0] === "invitations" && path[2] === "cancel") {
    result = await client.rpc("cancel_member_invitation", {
      p_invitation_id: path[1],
      p_reason: body.reason ?? "API cancellation",
    });
  } else if (path[0] === "clubs" && path[2] === "members" && path[4] === "status") {
    result = await client.rpc("set_membership_status", {
      p_club_id: path[1],
      p_membership_id: path[3],
      p_status: body.status,
      p_reason: body.reason ?? "API status change",
    });
  } else if (path[0] === "clubs" && path[2] === "members" && path[4] === "profile") {
    result = await client.rpc("update_member_profile", {
      p_club_id: path[1],
      p_membership_id: path[3],
      p_name: body.name,
      p_phone: body.phone ?? null,
      p_email: body.email ?? null,
      p_birth_date: body.birth_date ?? null,
    });
  } else if (path[0] === "clubs" && path[2] === "members" && path[4] === "role") {
    result = await client.rpc("assign_club_role", {
      p_club_id: path[1],
      p_app_account_id: body.app_account_id,
      p_role_key: body.role_key,
    });
  } else if (path[0] === "clubs" && path[2] === "identities" && path[4] === "unbind") {
    result = await client.rpc("unbind_line_identity", {
      p_club_id: path[1],
      p_app_account_id: path[3],
      p_reason: body.reason ?? "API unbind",
      p_create_rebind: true,
    });
  } else if (path.join("/") === "me/settings") {
    result = await client.rpc("update_my_settings", {
      p_notifications: body.notifications ?? {},
      p_privacy: body.privacy ?? {},
    });
  } else if (path[0] === "devices" && path[2] === "revoke") {
    result = await client.rpc("revoke_my_device", { p_device_id: path[1] });
  } else if (path[0] === "clubs" && path[2] === "line-oa" && path[3] === "configure") {
    result = await client.rpc("configure_line_oa", {
      p_club_id: path[1],
      p_display_name: body.display_name,
      p_basic_id: body.basic_id ?? null,
      p_channel_id: body.channel_id ?? null,
      p_mode: "active",
    });
  } else if (path[0] === "clubs" && path[2] === "line-oa" && path[3] === "pair") {
    result = await client.rpc("pair_line_oa_follower", {
      p_club_id: path[1],
      p_oa_user_id: body.oa_user_id,
      p_person_id: body.person_id,
    });
  } else if (path[0] === "clubs" && path[2] === "line-oa" && path[3] === "unpair") {
    result = await client.rpc("unpair_line_oa_follower", {
      p_club_id: path[1],
      p_follower_id: body.follower_id,
      p_reason: body.reason ?? "API unpair",
    });
  } else if (path[0] === "clubs" && path[2] === "line-oa" && path[3] === "push") {
    const permissions = await client.rpc("list_my_permissions", { p_club_id: path[1] });
    if (
      permissions.error ||
      !((permissions.data ?? []) as { permission_key: string }[]).some(
        (item) => item.permission_key === "oa.manage",
      )
    ) {
      return failure(403);
    }

    const kind: "broadcast" | "multicast" = body.kind === "multicast" ? "multicast" : "broadcast";
    const text = String(body.text ?? "").trim();
    if (!text || text.length > 2000) return failure();

    const dispatch = await loadClubOaDispatchContext(path[1]);
    if (!dispatch.ok) return failure(503);

    const recipients = dispatch.context.followers;
    const delivery = await deliverClubOaText(kind, recipients, text, dispatch.context);
    result = await client.rpc(
      "record_line_push",
      buildPushLogArgs(path[1], kind, recipients.length, text, delivery),
    );
    if (delivery.status === "failed") return failure(502);
  } else return failure(404);

  return result.error ? failure(403) : NextResponse.json({ data: result.data });
}

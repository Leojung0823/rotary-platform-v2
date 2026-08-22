import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const noStoreHeaders = { "Cache-Control": "no-store" };

export function messageFailure(status = 400) {
  return NextResponse.json({ error: "request_failed" }, { status, headers: noStoreHeaders });
}

export function messageSuccess(data: unknown, status = 200) {
  return NextResponse.json({ data }, { status, headers: noStoreHeaders });
}

export async function authenticatedMessageClient() {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  return { client, user: error ? null : data.user };
}

// The database speaks in SQLSTATEs; the browser gets a status and nothing
// else. A missing message and a message somebody else's club owns are both
// 404, so the endpoint cannot be used to discover what exists.
export function messageRpcFailure(error: { code?: string | null } | null) {
  if (error?.code === "22023") return messageFailure(400);
  if (error?.code === "P0002") return messageFailure(404);
  if (error?.code === "42501") return messageFailure(403);
  return messageFailure(500);
}

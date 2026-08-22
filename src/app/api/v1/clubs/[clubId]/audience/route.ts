import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
// A club has members and tags in the dozens, not thousands; anything longer is
// a malformed or probing request rather than a real selection.
const MAX_SELECTION = 200;

function parseIds(raw: string[]) {
  const ids = raw.flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
  if (ids.length > MAX_SELECTION || ids.some((id) => !uuidPattern.test(id))) return null;
  return Array.from(new Set(ids));
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ clubId: string }> },
) {
  const { clubId } = await context.params;
  const tagIds = parseIds(request.nextUrl.searchParams.getAll("tagId"));
  const membershipIds = parseIds(request.nextUrl.searchParams.getAll("membershipId"));
  if (!uuidPattern.test(clubId) || tagIds === null || membershipIds === null) {
    return NextResponse.json({ error: "request_failed" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "request_failed" }, { status: 401 });

  // Authorization lives in the RPC: it requires member.manage on this club,
  // because the answer is a list of named members.
  const { data, error } = await supabase.rpc("resolve_club_audience", {
    p_club_id: clubId,
    p_tag_ids: tagIds,
    p_membership_ids: membershipIds,
  });
  if (error) {
    const status = error.message?.includes("member_manage_required") ? 403 : 400;
    return NextResponse.json({ error: "request_failed" }, { status });
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  // Only the counts and the whole-club flag are returned to the browser. The
  // resolver also produces member names and OA recipient ids, and a picker
  // that is only ever going to render "12 members, 8 reachable" has no reason
  // to receive either.
  return NextResponse.json({
    whole_club: payload.whole_club === true,
    member_count: typeof payload.member_count === "number" ? payload.member_count : 0,
    reachable_count: typeof payload.reachable_count === "number" ? payload.reachable_count : 0,
  }, { headers: { "cache-control": "no-store" } });
}

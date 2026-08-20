import { NextResponse, type NextRequest } from "next/server";
import { archiveFailure, archiveNoStoreHeaders, archiveRpcStatus } from "@/lib/archive/http";
import { createTrustedAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function GET(request: NextRequest, { params }: { params: Promise<{ versionId: string }> }) {
  const clubId = String(request.nextUrl.searchParams.get("club_id") ?? "").toLowerCase();
  const { versionId: rawVersionId } = await params;
  const versionId = rawVersionId.toLowerCase();
  if (!uuidPattern.test(clubId) || !uuidPattern.test(versionId)) return archiveFailure(400);

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return archiveFailure(401);
  const authorized = await supabase.rpc("authorize_archive_download", {
    p_club_id: clubId,
    p_version_id: versionId,
  });
  if (authorized.error) return archiveFailure(archiveRpcStatus(authorized.error));
  if (!authorized.data || typeof authorized.data !== "object" || Array.isArray(authorized.data)) return archiveFailure(500);
  const projection = authorized.data as Record<string, unknown>;
  if (typeof projection.object_path !== "string" || typeof projection.original_filename !== "string") return archiveFailure(500);

  let admin;
  try {
    admin = createTrustedAdminClient();
  } catch {
    return archiveFailure(503);
  }
  const signed = await admin.storage.from("rotary-archives").createSignedUrl(
    projection.object_path,
    60,
    { download: projection.original_filename },
  );
  if (signed.error || !signed.data.signedUrl) return archiveFailure(500);
  const response = NextResponse.redirect(signed.data.signedUrl, 303);
  for (const [key, value] of Object.entries(archiveNoStoreHeaders)) response.headers.set(key, value);
  return response;
}

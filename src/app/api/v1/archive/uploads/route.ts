import { NextResponse, type NextRequest } from "next/server";
import { archiveFailure, archiveMutationAllowed, archiveNoStoreHeaders, archiveRpcStatus } from "@/lib/archive/http";
import { createTrustedAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maximumBytes = 10 * 1024 * 1024;
const maximumRequestBytes = maximumBytes + 128 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const acceptedTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "text/plain",
]);

function uploadProjection(value: unknown): { versionId: string; objectPath: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.version_id !== "string" || !uuidPattern.test(row.version_id)) return null;
  if (typeof row.object_path !== "string" || row.object_path.length < 1 || row.object_path.length > 500) return null;
  return { versionId: row.version_id, objectPath: row.object_path };
}

export async function POST(request: NextRequest) {
  if (!archiveMutationAllowed(request)) return archiveFailure(403);
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > maximumRequestBytes)) {
    return archiveFailure(413, "file_too_large");
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return archiveFailure(401);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return archiveFailure(400);
  }
  const clubId = String(formData.get("clubId") ?? "").toLowerCase();
  const itemId = String(formData.get("itemId") ?? "").toLowerCase();
  const changeSummary = String(formData.get("changeSummary") ?? "").trim();
  const file = formData.get("file");
  if (!uuidPattern.test(clubId) || !uuidPattern.test(itemId)
     || changeSummary.length > 500 || !(file instanceof File)
     || file.size < 1 || file.size > maximumBytes || !acceptedTypes.has(file.type)
     || file.name.length < 1 || file.name.length > 240) {
    return archiveFailure(file instanceof File && file.size > maximumBytes ? 413 : 400);
  }

  const started = await supabase.rpc("begin_archive_version", {
    p_club_id: clubId,
    p_archive_item_id: itemId,
    p_original_filename: file.name,
    p_file_size_bytes: file.size,
    p_media_type: file.type,
    p_change_summary: changeSummary,
  });
  if (started.error) return archiveFailure(archiveRpcStatus(started.error));
  const projection = uploadProjection(started.data);
  if (!projection) return archiveFailure(500);

  let admin;
  try {
    admin = createTrustedAdminClient();
  } catch {
    await supabase.rpc("fail_archive_version", {
      p_club_id: clubId,
      p_version_id: projection.versionId,
      p_reason: "trusted_storage_unavailable",
    });
    return archiveFailure(503);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const uploaded = await admin.storage.from("rotary-archives").upload(projection.objectPath, bytes, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: false,
  });
  if (uploaded.error) {
    await supabase.rpc("fail_archive_version", {
      p_club_id: clubId,
      p_version_id: projection.versionId,
      p_reason: "storage_upload_failed",
    });
    return archiveFailure(500);
  }

  const completed = await supabase.rpc("complete_archive_version", {
    p_club_id: clubId,
    p_version_id: projection.versionId,
  });
  if (completed.error) {
    await admin.storage.from("rotary-archives").remove([projection.objectPath]);
    await supabase.rpc("fail_archive_version", {
      p_club_id: clubId,
      p_version_id: projection.versionId,
      p_reason: "metadata_finalize_failed",
    });
    return archiveFailure(500);
  }

  return NextResponse.json({ data: { uploaded: true } }, { status: 201, headers: archiveNoStoreHeaders });
}

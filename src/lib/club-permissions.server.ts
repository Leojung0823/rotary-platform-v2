import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type ClubPermissionReadResult = Readonly<{
  ok: boolean;
  permissions: readonly string[];
}>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const permissionPattern = /^[a-z][a-z0-9_.]+$/u;
const maximumPermissionLength = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse the small, server-authoritative permission projection before it reaches
 * the shell. A malformed row is a failed read, not a reason to guess that an
 * account may manage a club.
 */
export function parseClubPermissionRows(rows: unknown): ClubPermissionReadResult {
  if (!Array.isArray(rows)) return { ok: false, permissions: [] };

  const permissions: string[] = [];
  for (const row of rows) {
    if (!isRecord(row)
      || typeof row.permission_key !== "string"
      || row.permission_key.length > maximumPermissionLength
      || !permissionPattern.test(row.permission_key)
      || permissions.includes(row.permission_key)) {
      return { ok: false, permissions: [] };
    }
    permissions.push(row.permission_key);
  }

  return { ok: true, permissions };
}

/**
 * React's cache is request-scoped for Server Components. The club id remains
 * part of the cache key and the Supabase client is cookie-bound, so a
 * permission projection cannot be shared with another club or user.
 */
export const readClubPermissions = cache(async (
  clubId: string,
): Promise<ClubPermissionReadResult> => {
  if (!uuidPattern.test(clubId)) return { ok: false, permissions: [] };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("list_my_permissions", {
      p_club_id: clubId,
    });
    if (error) return { ok: false, permissions: [] };
    return parseClubPermissionRows(data);
  } catch {
    return { ok: false, permissions: [] };
  }
});

import "server-only";
import { COVER_BUCKET } from "./cover-image";
import { createClient } from "@/lib/supabase/server";

// Long enough that a member reading the page does not watch images expire,
// short enough that a link pasted elsewhere stops working the same day.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

// Signed in one batch: a page with several events would otherwise pay a round
// trip per image, and round trips are the dominant cost on hosted Supabase.
export async function signCoverImageUrls(
  paths: readonly (string | null | undefined)[],
): Promise<ReadonlyMap<string, string>> {
  const wanted = [...new Set(paths.filter((path): path is string => typeof path === "string" && path.length > 0))];
  if (wanted.length === 0) return new Map();

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from(COVER_BUCKET)
      .createSignedUrls(wanted, SIGNED_URL_TTL_SECONDS);
    if (error || !data) return new Map();

    const signed = new Map<string, string>();
    for (const entry of data) {
      // Storage reports per-object failures inline rather than throwing, and a
      // missing object must not take the whole page down with it.
      if (entry.error || !entry.signedUrl || !entry.path) continue;
      signed.set(entry.path, entry.signedUrl);
    }
    return signed;
  } catch {
    // An event with no picture is a smaller loss than an event page that fails.
    return new Map();
  }
}

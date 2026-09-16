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
    if (error || !data) {
      report(wanted.length, error?.message ?? "no_data");
      return new Map();
    }

    const signed = new Map<string, string>();
    for (const entry of data) {
      // Storage reports per-object failures inline rather than throwing, and a
      // missing object must not take the whole page down with it.
      if (entry.error || !entry.signedUrl || !entry.path) continue;
      signed.set(entry.path, entry.signedUrl);
    }
    if (signed.size < wanted.length) report(wanted.length - signed.size, "object_unsigned");
    return signed;
  } catch (thrown) {
    // An event with no picture is a smaller loss than an event page that fails.
    report(wanted.length, thrown instanceof Error ? thrown.message : "unknown");
    return new Map();
  }
}

/**
 * Say so in the server log when an event holds a key that will not sign.
 *
 * Returning an empty map stays the right behaviour -- a page without a picture
 * beats a page that fails -- but silence made "this event has no cover" and
 * "this event's cover cannot be read" look identical from the outside, which is
 * exactly the pair that had to be told apart when a cover stopped appearing.
 *
 * The key itself is `<club>/<event>`, both of which are already in the URL of
 * the page being rendered, so the count and the reason are logged and the keys
 * are not.
 */
function report(unsigned: number, reason: string): void {
  console.warn(`EVENT_COVER_SIGN_FAILED unsigned=${unsigned} reason=${reason}`);
}

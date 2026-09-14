import "server-only";

export type GeocodeOutcome =
  | { ok: true; latitude: number; longitude: number; formattedAddress: string }
  | { ok: false; reason: "not_configured" | "not_found" | "lookup_failed" };

// A loose box around Taiwan. Google will happily return a same-named street in
// another country, and every club using this platform meets in Taiwan, so a
// result inside the box is preferred over one outside it.
const TAIWAN_BOUNDS = { latMin: 21.5, latMax: 25.5, lngMin: 119, lngMax: 122.5 };

function inTaiwan(latitude: number, longitude: number) {
  return latitude >= TAIWAN_BOUNDS.latMin && latitude <= TAIWAN_BOUNDS.latMax
    && longitude >= TAIWAN_BOUNDS.lngMin && longitude <= TAIWAN_BOUNDS.lngMax;
}

/**
 * Addresses are typed by people, so the same venue arrives spelled several
 * ways. Trying a few shapes costs one extra request only when the first misses.
 */
export function addressVariants(raw: string): readonly string[] {
  const base = raw.replace(/\s+/gu, " ").trim();
  if (!base) return [];
  const variants = new Set<string>([base]);
  if (!/台灣|臺灣|taiwan/iu.test(base)) {
    variants.add(`${base} 台灣`);
  }
  // Chinese addresses are often written without spaces; a spaced one can miss.
  variants.add(base.replace(/\s+/gu, ""));
  return [...variants].filter(Boolean);
}

type GoogleGeocodeResponse = {
  status?: unknown;
  results?: Array<{
    formatted_address?: unknown;
    geometry?: { location?: { lat?: unknown; lng?: unknown } };
  }>;
};

export function pickResult(response: GoogleGeocodeResponse) {
  if (response.status !== "OK" || !Array.isArray(response.results) || response.results.length === 0) {
    return null;
  }
  const usable = response.results.flatMap((result) => {
    const latitude = result.geometry?.location?.lat;
    const longitude = result.geometry?.location?.lng;
    if (typeof latitude !== "number" || typeof longitude !== "number"
      || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    return [{
      latitude,
      longitude,
      formattedAddress: typeof result.formatted_address === "string" ? result.formatted_address : "",
    }];
  });
  if (usable.length === 0) return null;
  return usable.find((result) => inTaiwan(result.latitude, result.longitude)) ?? usable[0];
}

export async function geocodeVenueAddress(address: string): Promise<GeocodeOutcome> {
  // The key never reaches the browser: this module is server-only and the
  // action that calls it returns coordinates, not the key or the raw response.
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) return { ok: false, reason: "not_configured" };

  for (const query of addressVariants(address)) {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", query);
    url.searchParams.set("language", "zh-TW");
    url.searchParams.set("region", "tw");
    url.searchParams.set("components", "country:TW");
    url.searchParams.set("key", apiKey);

    let response: Response;
    try {
      // Without a deadline a slow provider would hold the server action open
      // for as long as it liked, the same guard the LINE client uses.
      response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    } catch {
      return { ok: false, reason: "lookup_failed" };
    }
    if (!response.ok) continue;

    let payload: GoogleGeocodeResponse;
    try {
      payload = await response.json() as GoogleGeocodeResponse;
    } catch {
      continue;
    }

    const picked = pickResult(payload);
    if (picked) {
      // Six decimals is ~0.1m and matches the numeric(9,6) venue columns.
      return {
        ok: true,
        latitude: Number(picked.latitude.toFixed(6)),
        longitude: Number(picked.longitude.toFixed(6)),
        formattedAddress: picked.formattedAddress,
      };
    }
  }

  return { ok: false, reason: "not_found" };
}

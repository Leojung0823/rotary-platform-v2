import { timingSafeEqual } from "node:crypto";

const authorizationPrefix = "Bearer ";

export function hasValidBirthdayCollectionSchedulerSecret(authorization: string | null) {
  const expected = process.env.BIRTHDAY_COLLECTION_SCHEDULER_SECRET;
  if (!expected || expected.length < 32 || !authorization?.startsWith(authorizationPrefix)) return false;

  const provided = authorization.slice(authorizationPrefix.length);
  const expectedBytes = Buffer.from(expected, "utf8");
  const providedBytes = Buffer.from(provided, "utf8");
  if (expectedBytes.length === 0 || expectedBytes.length !== providedBytes.length) return false;

  return timingSafeEqual(expectedBytes, providedBytes);
}

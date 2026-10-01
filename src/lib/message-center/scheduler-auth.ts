import { timingSafeEqual } from "node:crypto";

const authorizationPrefix = "Bearer ";

export function hasValidMessageCenterSchedulerSecret(authorization: string | null) {
  const expected = process.env.MESSAGE_CENTER_SCHEDULER_SECRET;
  if (!expected || expected.length < 32 || !authorization?.startsWith(authorizationPrefix)) return false;

  const providedBytes = Buffer.from(authorization.slice(authorizationPrefix.length), "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (expectedBytes.length !== providedBytes.length) return false;

  return timingSafeEqual(expectedBytes, providedBytes);
}

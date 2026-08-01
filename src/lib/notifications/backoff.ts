export const DEFAULT_MAX_DELIVERY_ATTEMPTS = 3;

export function retryBackoffSeconds(attemptCount: number) {
  if (!Number.isInteger(attemptCount) || attemptCount < 1) throw new Error("invalid_attempt_count");
  return Math.min(3_600, 30 * 2 ** Math.min(attemptCount - 1, 10));
}

export function shouldRetry(attemptCount: number, maxAttempts = DEFAULT_MAX_DELIVERY_ATTEMPTS) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    throw new Error("invalid_max_attempts");
  }
  return attemptCount < maxAttempts;
}

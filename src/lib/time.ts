/**
 * The time zone every displayed timestamp is rendered in.
 *
 * Pages render on the server, where `Intl.DateTimeFormat` with no `timeZone`
 * uses the server's zone -- UTC on Render. That produced Traditional Chinese
 * timestamps eight hours behind the reader, which look local and are not: an
 * audit entry written at 13:39 Taipei was shown as 清晨5:39.
 *
 * Clubs carry their own `timezone_name` (defaulting to this value), and a club
 * outside Taiwan would want its own zone here. Until one exists, one constant
 * beats a per-page guess, and the guess was wrong everywhere.
 */
export const APP_TIME_ZONE = "Asia/Taipei";

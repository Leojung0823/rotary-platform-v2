import { withLineExternalBrowser } from "@/lib/pwa/install";

export type MemberInvitationPath = "/join" | "/join-club";

/**
 * Builds a token-bearing member URL for people to open from LINE, email, QR,
 * or a copied link. The query parameter is harmless outside LINE and lets
 * ordinary web URLs open in the external browser when LINE supports it.
 */
export function externalMemberInvitationUrl(
  siteOrigin: string,
  path: MemberInvitationPath,
  token: string,
) {
  const target = new URL(path, siteOrigin);
  target.searchParams.set("token", token);
  return withLineExternalBrowser(target.toString());
}

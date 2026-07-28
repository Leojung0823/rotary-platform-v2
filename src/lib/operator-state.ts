export type InviteStatus = "pending" | "sent" | "accepted" | "expired" | "revoked" | "failed";

export function canAcceptInvite(status: InviteStatus, expiresAt: Date, now = new Date()) {
  return (status === "pending" || status === "sent") && expiresAt.getTime() > now.getTime();
}

export function canClubOperatorRevoke(activeOperatorCount: number, clubStatus: string) {
  return clubStatus !== "active" || activeOperatorCount > 1;
}

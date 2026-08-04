import { createHash } from "node:crypto";

export function lineIdentityLoginEmail(providerSubject: string, personId: string): string {
  const identityKey = `${providerSubject}:${personId}`;
  const suffix = createHash("sha256").update(identityKey).digest("hex").slice(0, 24);
  return `line-${suffix}@identity.local`;
}

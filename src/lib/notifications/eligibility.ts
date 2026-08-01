export type ExternalDeliveryEligibility = {
  preferenceEnabled: boolean;
  accountActive: boolean;
  membershipActive: boolean;
  clubActive: boolean;
  trustedEmailPresent?: boolean;
  pairedOaFollowerFollowing?: boolean;
  providerMode: "mock" | "disabled";
};

export function emailDeliveryEligible(input: ExternalDeliveryEligibility) {
  return input.preferenceEnabled
    && input.accountActive
    && input.membershipActive
    && input.clubActive
    && input.trustedEmailPresent === true
    && (input.providerMode === "mock" || input.providerMode === "disabled");
}

export function lineDeliveryEligible(input: ExternalDeliveryEligibility) {
  return input.preferenceEnabled
    && input.accountActive
    && input.membershipActive
    && input.clubActive
    && input.pairedOaFollowerFollowing === true
    && (input.providerMode === "mock" || input.providerMode === "disabled");
}

export function deduplicateEligibleAccounts(accountIds: readonly string[]) {
  return [...new Set(accountIds)];
}

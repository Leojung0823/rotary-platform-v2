export type AudienceMode = "everyone" | "tags" | "members";

export type AudienceSelection = {
  mode: AudienceMode;
  tagIds: readonly string[];
  membershipIds: readonly string[];
};

export const emptyAudienceSelection: AudienceSelection = {
  mode: "everyone",
  tagIds: [],
  membershipIds: [],
};

/**
 * What actually gets sent for a selection.
 *
 * The mode is a property of the control, not of the data: the database knows
 * only "these tags and these members", and no rows at all means the whole
 * club. So switching back to 全體 has to clear both lists rather than merely
 * hiding them, or an audience the officer thought they had removed would still
 * be attached.
 */
export function resolvedAudience(selection: AudienceSelection) {
  if (selection.mode === "tags") {
    return { tagIds: [...selection.tagIds], membershipIds: [] };
  }
  if (selection.mode === "members") {
    return { tagIds: [], membershipIds: [...selection.membershipIds] };
  }
  return { tagIds: [], membershipIds: [] };
}

/** True when the selection addresses the whole club, however it got there. */
export function addressesWholeClub(selection: AudienceSelection) {
  const resolved = resolvedAudience(selection);
  return resolved.tagIds.length === 0 && resolved.membershipIds.length === 0;
}

export function audienceQueryString(selection: AudienceSelection) {
  const resolved = resolvedAudience(selection);
  const params = new URLSearchParams();
  for (const tagId of resolved.tagIds) params.append("tagId", tagId);
  for (const membershipId of resolved.membershipIds) params.append("membershipId", membershipId);
  return params.toString();
}

export function toggleId(current: readonly string[], id: string) {
  return current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
}

/**
 * The selection an event's stored audience corresponds to.
 *
 * An event addressed to nobody in particular is the whole club, which is what
 * the picker calls "everyone" -- not an empty tag list, which would render as
 * "tags, none chosen" and read as a mistake.
 */
export function audienceFromEvent(
  tagIds: readonly string[],
  membershipIds: readonly string[],
): AudienceSelection {
  if (tagIds.length === 0 && membershipIds.length === 0) return emptyAudienceSelection;
  // Tags win the mode when both are present: the picker shows one list at a
  // time, and a tag is the reusable half of the pair.
  return {
    mode: tagIds.length > 0 ? "tags" : "members",
    tagIds: [...tagIds],
    membershipIds: [...membershipIds],
  };
}

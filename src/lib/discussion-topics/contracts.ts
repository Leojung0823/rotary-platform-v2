const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const audienceKinds = ["all", "tags", "people"] as const;
export type DiscussionAudienceKind = (typeof audienceKinds)[number];

export type DiscussionTopicSummary = Readonly<{
  id: string; clubId: string; title: string; description: string; deadlineAt: string;
  audienceKind: DiscussionAudienceKind; anonymousVotes: boolean; createdAt: string;
  isOpen: boolean; voteCount: number; commentCount: number;
  hasVoted?: boolean; audienceCount?: number; audienceTags?: readonly string[];
}>;

export type DiscussionTopicDetail = DiscussionTopicSummary & Readonly<{
  myVoteOptionId: string | null;
  options: readonly Readonly<{ id: string; label: string; voteCount: number }>[];
  comments: readonly Readonly<{ id: string; body: string; authorDisplayName: string; createdAt: string }>[];
  namedVotes: readonly Readonly<{ membershipId: string; displayName: string; optionId: string; optionText: string }>[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isDateTime(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function parseSummary(value: unknown, expectedClubId: string): DiscussionTopicSummary | null {
  if (!isRecord(value)
    || typeof value.id !== "string" || !uuidPattern.test(value.id)
    || typeof value.club_id !== "string" || value.club_id.toLowerCase() !== expectedClubId.toLowerCase()
    || typeof value.title !== "string" || value.title.length < 2 || value.title.length > 120
    || typeof value.description !== "string" || value.description.length > 5000
    || !isDateTime(value.deadline_at)
    || typeof value.audience_kind !== "string" || !(audienceKinds as readonly string[]).includes(value.audience_kind)
    || typeof value.anonymous_votes !== "boolean"
    || !isDateTime(value.created_at)
    || typeof value.is_open !== "boolean"
    || !Number.isSafeInteger(value.vote_count) || (value.vote_count as number) < 0
    || !Number.isSafeInteger(value.comment_count) || (value.comment_count as number) < 0) return null;

  const hasVoted = value.has_voted;
  const audienceCount = value.audience_count;
  const audienceTags = value.audience_tags;
  if (hasVoted !== undefined && typeof hasVoted !== "boolean") return null;
  if (audienceCount !== undefined && (!Number.isSafeInteger(audienceCount) || (audienceCount as number) < 0)) return null;
  if (audienceTags !== undefined && (!Array.isArray(audienceTags)
    || audienceTags.length > 20 || audienceTags.some((tag) => typeof tag !== "string" || tag.length > 40))) return null;

  return {
    id: value.id.toLowerCase(), clubId: expectedClubId.toLowerCase(), title: value.title,
    description: value.description, deadlineAt: value.deadline_at,
    audienceKind: value.audience_kind as DiscussionAudienceKind, anonymousVotes: value.anonymous_votes,
    createdAt: value.created_at, isOpen: value.is_open, voteCount: value.vote_count as number,
    commentCount: value.comment_count as number,
    ...(hasVoted === undefined ? {} : { hasVoted }),
    ...(audienceCount === undefined ? {} : { audienceCount: audienceCount as number }),
    ...(audienceTags === undefined ? {} : { audienceTags: audienceTags as string[] }),
  };
}

export function parseDiscussionTopicList(value: unknown, expectedClubId: string): readonly DiscussionTopicSummary[] {
  if (!uuidPattern.test(expectedClubId) || !isRecord(value)
    || typeof value.club_id !== "string" || value.club_id.toLowerCase() !== expectedClubId.toLowerCase()
    || !Array.isArray(value.topics) || value.topics.length > 500) throw new Error("invalid_discussion_topic_list");
  const topics = value.topics.map((topic) => parseSummary(topic, expectedClubId));
  if (topics.some((topic) => topic === null)) throw new Error("invalid_discussion_topic_list");
  const complete = topics as DiscussionTopicSummary[];
  if (new Set(complete.map((topic) => topic.id)).size !== complete.length) throw new Error("duplicate_discussion_topic");
  return complete;
}

export function parseDiscussionTopicDetail(value: unknown, expectedClubId: string, expectedTopicId: string): DiscussionTopicDetail {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.toLowerCase() !== expectedTopicId.toLowerCase()) {
    throw new Error("invalid_discussion_topic_detail");
  }
  const summary = parseSummary(value, expectedClubId);
  if (!summary
    || !(value.my_vote_option_id === null || (typeof value.my_vote_option_id === "string" && uuidPattern.test(value.my_vote_option_id)))
    || !Array.isArray(value.options) || value.options.length < 2 || value.options.length > 8
    || !Array.isArray(value.comments) || value.comments.length > 200
    || !Array.isArray(value.named_votes) || value.named_votes.length > 1000) throw new Error("invalid_discussion_topic_detail");

  const options = value.options.map((option) => {
    if (!isRecord(option) || typeof option.id !== "string" || !uuidPattern.test(option.id)
      || typeof option.label !== "string" || option.label.length < 1 || option.label.length > 100
      || !Number.isSafeInteger(option.vote_count) || (option.vote_count as number) < 0) return null;
    return { id: option.id.toLowerCase(), label: option.label, voteCount: option.vote_count as number };
  });
  const comments = value.comments.map((comment) => {
    if (!isRecord(comment) || typeof comment.id !== "string" || !uuidPattern.test(comment.id)
      || typeof comment.body !== "string" || comment.body.length < 1 || comment.body.length > 2000
      || typeof comment.author_display_name !== "string" || comment.author_display_name.length > 100
      || !isDateTime(comment.created_at)) return null;
    return { id: comment.id.toLowerCase(), body: comment.body, authorDisplayName: comment.author_display_name, createdAt: comment.created_at };
  });
  const namedVotes = value.named_votes.map((vote) => {
    if (!isRecord(vote) || typeof vote.membership_id !== "string" || !uuidPattern.test(vote.membership_id)
      || typeof vote.display_name !== "string" || vote.display_name.length > 100
      || typeof vote.option_id !== "string" || !uuidPattern.test(vote.option_id)
      || typeof vote.option_text !== "string" || vote.option_text.length > 100) return null;
    return { membershipId: vote.membership_id.toLowerCase(), displayName: vote.display_name, optionId: vote.option_id.toLowerCase(), optionText: vote.option_text };
  });
  if (options.some((option) => option === null) || comments.some((comment) => comment === null)
    || namedVotes.some((vote) => vote === null)) throw new Error("invalid_discussion_topic_detail");
  return {
    ...summary,
    myVoteOptionId: value.my_vote_option_id === null ? null : (value.my_vote_option_id as string).toLowerCase(),
    options: options as DiscussionTopicDetail["options"],
    comments: comments as DiscussionTopicDetail["comments"],
    namedVotes: namedVotes as DiscussionTopicDetail["namedVotes"],
  };
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;

export type BirthdayCollectionAssignment = Readonly<{
  participantId: string;
  campaignId: string;
  recipientMembershipId: string;
  recipientName: string;
  birthdayDate: string;
  participantStatus: "invited" | "submitted" | "declined" | "disabled";
  questionPrompt: string;
  submissionId: string | null;
  submissionStatus: "submitted" | "published" | "hidden" | "deleted" | null;
  content: string | null;
  submittedAt: string | null;
  canEdit: boolean;
  canDecline: boolean;
}>;

export type BirthdayCollectionCampaign = Readonly<{
  campaignId: string;
  recipientMembershipId: string;
  recipientName: string;
  birthdayYear: number;
  birthdayDate: string;
  campaignStatus: "draft" | "collecting" | "published" | "closed" | "hidden";
  participantCount: number;
  submittedCount: number;
}>;

export type BirthdayCollectionParticipant = Readonly<{
  participantId: string;
  campaignId: string;
  assigneeMembershipId: string;
  assigneeName: string;
  participantStatus: "invited" | "submitted" | "declined" | "disabled";
  questionPrompt: string;
  submissionStatus: "submitted" | "published" | "hidden" | "deleted" | null;
  authorName: string | null;
  content: string | null;
  submittedAt: string | null;
  processingHistory: readonly BirthdayCollectionSubmissionEvent[];
}>;

export type BirthdayCollectionSubmissionEvent = Readonly<{
  id: string;
  eventType: "submitted" | "updated" | "resubmitted" | "deleted" | "published" | "hidden" | "declined";
  previousStatus: "submitted" | "published" | "hidden" | "deleted" | null;
  nextStatus: "submitted" | "published" | "hidden" | "deleted" | "declined";
  actorName: string | null;
  contentSnapshot: string | null;
  createdAt: string;
}>;

export type BirthdayCollectionPublishedWish = Readonly<{
  submissionId: string;
  campaignId: string;
  recipientMembershipId: string;
  recipientName: string;
  birthdayDate: string;
  content: string;
  publishedAt: string;
  authorName: string | null;
  authorIsHidden: boolean;
}>;

export type BirthdayCollectionQuestion = Readonly<{
  id: string;
  questionKey: string;
  prompt: string;
  tone: "warm" | "humorous" | "moving";
  sortOrder: number;
  isEnabled: boolean;
  scope: "platform" | "club";
}>;

export type BirthdayCollectionPage = Readonly<{
  clubId: string;
  canManage: boolean;
  myAssignments: readonly BirthdayCollectionAssignment[];
  campaigns: readonly BirthdayCollectionCampaign[];
  participants: readonly BirthdayCollectionParticipant[];
  publishedWishes: readonly BirthdayCollectionPublishedWish[];
  questionBank: Readonly<{
    platform: readonly BirthdayCollectionQuestion[];
    club: readonly BirthdayCollectionQuestion[];
  }>;
}>;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("invalid_birthday_collection_projection");
  return value as Record<string, unknown>;
}

function array(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error("invalid_birthday_collection_projection");
  return value;
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw new Error("invalid_birthday_collection_projection");
  return value;
}

function text(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > maximum) throw new Error("invalid_birthday_collection_projection");
  return value;
}

function nullableText(value: unknown, maximum: number): string | null {
  if (value === null) return null;
  return text(value, maximum);
}

function date(value: unknown): string {
  if (typeof value !== "string" || !datePattern.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error("invalid_birthday_collection_projection");
  }
  return value;
}

function timestamp(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error("invalid_birthday_collection_projection");
  return value;
}

function requiredTimestamp(value: unknown): string {
  const result = timestamp(value);
  if (result === null) throw new Error("invalid_birthday_collection_projection");
  return result;
}

function bool(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("invalid_birthday_collection_projection");
  return value;
}

function integer(value: unknown, maximum: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > maximum) throw new Error("invalid_birthday_collection_projection");
  return value;
}

function birthdayYear(value: unknown): number {
  const result = integer(value, 2200);
  if (result < 2000) throw new Error("invalid_birthday_collection_projection");
  return result;
}

function status<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error("invalid_birthday_collection_projection");
  return value as T;
}

const participantStatuses = ["invited", "submitted", "declined", "disabled"] as const;
const submissionStatuses = ["submitted", "published", "hidden", "deleted"] as const;
const campaignStatuses = ["draft", "collecting", "published", "closed", "hidden"] as const;
const questionTones = ["warm", "humorous", "moving"] as const;

function parseAssignment(value: unknown): BirthdayCollectionAssignment {
  const item = record(value);
  return {
    participantId: uuid(item.participant_id),
    campaignId: uuid(item.campaign_id),
    recipientMembershipId: uuid(item.recipient_membership_id),
    recipientName: text(item.recipient_name, 160),
    birthdayDate: date(item.birthday_date),
    participantStatus: status(item.participant_status, participantStatuses),
    questionPrompt: text(item.question_prompt, 300),
    submissionId: item.submission_id === null ? null : uuid(item.submission_id),
    submissionStatus: item.submission_status === null ? null : status(item.submission_status, submissionStatuses),
    content: nullableText(item.content, 500),
    submittedAt: timestamp(item.submitted_at),
    canEdit: bool(item.can_edit),
    canDecline: bool(item.can_decline),
  };
}

function parseCampaign(value: unknown): BirthdayCollectionCampaign {
  const item = record(value);
  const participantCount = integer(item.participant_count, 100000);
  const submittedCount = integer(item.submitted_count, 100000);
  if (submittedCount > participantCount) throw new Error("invalid_birthday_collection_projection");
  return {
    campaignId: uuid(item.campaign_id),
    recipientMembershipId: uuid(item.recipient_membership_id),
    recipientName: text(item.recipient_name, 160),
    birthdayYear: birthdayYear(item.birthday_year),
    birthdayDate: date(item.birthday_date),
    campaignStatus: status(item.campaign_status, campaignStatuses),
    participantCount,
    submittedCount,
  };
}

function parseParticipant(value: unknown): BirthdayCollectionParticipant {
  const item = record(value);
  return {
    participantId: uuid(item.participant_id),
    campaignId: uuid(item.campaign_id),
    assigneeMembershipId: uuid(item.assignee_membership_id),
    assigneeName: text(item.assignee_name, 160),
    participantStatus: status(item.participant_status, participantStatuses),
    questionPrompt: text(item.question_prompt, 300),
    submissionStatus: item.submission_status === null ? null : status(item.submission_status, submissionStatuses),
    authorName: nullableText(item.author_name, 160),
    content: nullableText(item.content, 500),
    submittedAt: timestamp(item.submitted_at),
    processingHistory: array(item.processing_history).map(parseSubmissionEvent),
  };
}

const eventTypes = ["submitted", "updated", "resubmitted", "deleted", "published", "hidden", "declined"] as const;
const eventPreviousStatuses = ["submitted", "published", "hidden", "deleted"] as const;
const eventNextStatuses = ["submitted", "published", "hidden", "deleted", "declined"] as const;

function parseSubmissionEvent(value: unknown): BirthdayCollectionSubmissionEvent {
  const item = record(value);
  return {
    id: uuid(item.id),
    eventType: status(item.event_type, eventTypes),
    previousStatus: item.previous_status === null ? null : status(item.previous_status, eventPreviousStatuses),
    nextStatus: status(item.next_status, eventNextStatuses),
    actorName: nullableText(item.actor_name, 160),
    contentSnapshot: nullableText(item.content_snapshot, 500),
    createdAt: requiredTimestamp(item.created_at),
  };
}

function parsePublishedWish(value: unknown): BirthdayCollectionPublishedWish {
  const item = record(value);
  const authorName = nullableText(item.author_name, 160);
  const authorIsHidden = bool(item.author_is_hidden);
  if ((authorIsHidden && authorName !== null) || (!authorIsHidden && authorName === null)) {
    throw new Error("invalid_birthday_collection_projection");
  }
  return {
    submissionId: uuid(item.submission_id),
    campaignId: uuid(item.campaign_id),
    recipientMembershipId: uuid(item.recipient_membership_id),
    recipientName: text(item.recipient_name, 160),
    birthdayDate: date(item.birthday_date),
    content: text(item.content, 500),
    publishedAt: requiredTimestamp(item.published_at),
    authorName,
    authorIsHidden,
  };
}

function parseQuestion(value: unknown, expectedScope: "platform" | "club"): BirthdayCollectionQuestion {
  const item = record(value);
  if (item.scope !== expectedScope) throw new Error("invalid_birthday_collection_projection");
  return {
    id: uuid(item.id),
    questionKey: text(item.question_key, 64),
    prompt: text(item.prompt, 300),
    tone: status(item.tone, questionTones),
    sortOrder: integer(item.sort_order, 10000),
    isEnabled: bool(item.is_enabled),
    scope: expectedScope,
  };
}

export function parseBirthdayCollectionPageProjection(value: unknown, publishedValue?: unknown): BirthdayCollectionPage {
  const source = record(value);
  const questionBank = record(source.question_bank);
  return {
    clubId: uuid(source.club_id),
    canManage: bool(source.can_manage),
    myAssignments: array(source.my_assignments).map(parseAssignment),
    campaigns: array(source.campaigns).map(parseCampaign),
    participants: array(source.participants).map(parseParticipant),
    publishedWishes: array(publishedValue === undefined ? source.published_wishes : publishedValue).map(parsePublishedWish),
    questionBank: {
      platform: array(questionBank.platform).map((item) => parseQuestion(item, "platform")),
      club: array(questionBank.club).map((item) => parseQuestion(item, "club")),
    },
  };
}

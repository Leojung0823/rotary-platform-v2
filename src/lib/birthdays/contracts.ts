export type BirthdayClub = Readonly<{
  clubId: string;
  clubCode: string;
  clubName: string;
}>;

export type BirthdayPreference = Readonly<{
  membershipId: string;
  hasBirthDate: boolean;
  hasPreference: boolean;
  isListed: boolean;
  allowWishes: boolean;
}>;

export type BirthdayMember = Readonly<{
  membershipId: string;
  displayName: string;
  avatarUrl: string | null;
  birthMonth: number;
  birthDay: number;
  age: number | null;
  daysUntil: number | null;
  allowWishes: boolean;
  isSelf: boolean;
}>;

export type BirthdayWish = Readonly<{
  id: string;
  recipientMembershipId: string;
  recipientName: string;
  authorName: string | null;
  authorIsHidden: boolean;
  content: string;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
  canModerate: boolean;
}>;

export type BirthdayPageProjection = Readonly<{
  clubs: readonly BirthdayClub[];
  selectedClubId: string | null;
  canManage: boolean;
  myPreference: BirthdayPreference | null;
  birthdays: readonly BirthdayMember[];
  wishes: readonly BirthdayWish[];
}>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_birthday_projection");
  return value as Record<string, unknown>;
}

function text(value: unknown, maxLength = 500): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maxLength) {
    throw new Error("invalid_birthday_projection");
  }
  return value;
}

function uuid(value: unknown): string {
  const result = text(value, 36).toLowerCase();
  if (!uuidPattern.test(result)) throw new Error("invalid_birthday_projection");
  return result;
}

function bool(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("invalid_birthday_projection");
  return value;
}

function isoDate(value: unknown): string {
  const result = text(value, 40);
  if (Number.isNaN(Date.parse(result))) throw new Error("invalid_birthday_projection");
  return result;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("invalid_birthday_projection");
  return value;
}

function monthOrDay(value: unknown, maximum: number): number {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > maximum) {
    throw new Error("invalid_birthday_projection");
  }
  return Number(value);
}

function nullableInteger(value: unknown, maximum: number): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > maximum) {
    throw new Error("invalid_birthday_projection");
  }
  return Number(value);
}

export function parseBirthdayPageProjection(value: unknown): BirthdayPageProjection {
  const source = record(value);
  const clubs = array(source.clubs).map((item) => {
    const club = record(item);
    return {
      clubId: uuid(club.club_id),
      clubCode: text(club.club_code, 32),
      clubName: text(club.club_name, 100),
    };
  });

  const selectedClubId = source.selected_club_id === null ? null : uuid(source.selected_club_id);
  if (selectedClubId && !clubs.some((club) => club.clubId === selectedClubId)) {
    throw new Error("invalid_birthday_projection");
  }

  const myPreference = source.my_preference === null ? null : (() => {
    const preference = record(source.my_preference);
    return {
      membershipId: uuid(preference.membership_id),
      hasBirthDate: bool(preference.has_birth_date),
      hasPreference: preference.has_preference === undefined ? true : bool(preference.has_preference),
      isListed: bool(preference.is_listed),
      allowWishes: bool(preference.allow_wishes),
    };
  })();

  const birthdays = array(source.birthdays).map((item) => {
    const birthday = record(item);
    const avatarUrl = birthday.avatar_url;
    if (avatarUrl !== null && typeof avatarUrl !== "string") throw new Error("invalid_birthday_projection");
    return {
      membershipId: uuid(birthday.membership_id),
      displayName: text(birthday.display_name, 160),
      avatarUrl,
      birthMonth: monthOrDay(birthday.birth_month, 12),
      birthDay: monthOrDay(birthday.birth_day, 31),
      age: nullableInteger(birthday.age, 150),
      daysUntil: nullableInteger(birthday.days_until, 366),
      allowWishes: bool(birthday.allow_wishes),
      isSelf: bool(birthday.is_self),
    };
  });

  const wishes = array(source.wishes).map((item) => {
    const wish = record(item);
    const authorName = wish.author_name === null ? null : text(wish.author_name, 160);
    const authorIsHidden = wish.author_is_hidden === undefined
      ? authorName === null
      : bool(wish.author_is_hidden);
    if ((authorIsHidden && authorName !== null) || (!authorIsHidden && authorName === null)) {
      throw new Error("invalid_birthday_projection");
    }
    return {
      id: uuid(wish.id),
      recipientMembershipId: uuid(wish.recipient_membership_id),
      recipientName: text(wish.recipient_name, 160),
      authorName,
      authorIsHidden,
      content: text(wish.content, 500),
      createdAt: isoDate(wish.created_at),
      updatedAt: isoDate(wish.updated_at),
      canEdit: bool(wish.can_edit),
      canDelete: bool(wish.can_delete),
      canModerate: bool(wish.can_moderate),
    };
  });

  return {
    clubs,
    selectedClubId,
    canManage: bool(source.can_manage),
    myPreference,
    birthdays,
    wishes,
  };
}

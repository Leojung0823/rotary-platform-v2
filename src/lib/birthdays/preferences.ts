export type BirthdayPreferenceSetting = Readonly<{
  membershipId: string;
  clubId: string;
  clubCode: string;
  clubName: string;
  hasBirthDate: boolean;
  hasPreference: boolean;
  isListed: boolean;
  allowWishes: boolean;
}>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const maximumPreferences = 100;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_birthday_preferences");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) {
    throw new Error("invalid_birthday_preferences");
  }
  return value;
}

function uuid(value: unknown): string {
  const result = text(value, 36).toLowerCase();
  if (!uuidPattern.test(result)) throw new Error("invalid_birthday_preferences");
  return result;
}

function bool(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("invalid_birthday_preferences");
  return value;
}

export function parseBirthdayPreferences(value: unknown): readonly BirthdayPreferenceSetting[] {
  if (!Array.isArray(value) || value.length > maximumPreferences) {
    throw new Error("invalid_birthday_preferences");
  }

  return value.map((item) => {
    const preference = record(item);
    return {
      membershipId: uuid(preference.membership_id),
      clubId: uuid(preference.club_id),
      clubCode: text(preference.club_code, 64),
      clubName: text(preference.club_name, 300),
      hasBirthDate: bool(preference.has_birth_date),
      hasPreference: bool(preference.has_preference),
      isListed: bool(preference.is_listed),
      allowWishes: bool(preference.allow_wishes),
    };
  });
}

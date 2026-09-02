export type ClubInput = {
  clubCode: string;
  clubName: string;
  operatorEmail: string;
  operatorName: string;
  operatorPassword: string;
};

export type OperatorInput = { email: string; displayName: string; password: string };
export type MemberInput = { name: string; phone: string; email: string; birthDate: string | null };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clubCodePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/;
const clubNameControlCharacterPattern = /[\u0000-\u001F\u007F-\u009F]/u;

export function isValidClubName(value: string) {
  return value.length >= 2 && value.length <= 100 && !clubNameControlCharacterPattern.test(value);
}

export function parseClubInput(formData: FormData): ClubInput {
  const input = {
    clubCode: String(formData.get("clubCode") ?? "").trim().toUpperCase(),
    clubName: String(formData.get("clubName") ?? "").trim(),
    operatorEmail: String(formData.get("operatorEmail") ?? "").trim().toLowerCase(),
    operatorName: String(formData.get("operatorName") ?? "").trim(),
    operatorPassword: String(formData.get("operatorPassword") ?? ""),
  };
  const operatorPasswordConfirmation = String(formData.get("operatorPasswordConfirmation") ?? "");
  if (!clubCodePattern.test(input.clubCode)) throw new Error("invalid_club_code");
  if (!isValidClubName(input.clubName)) throw new Error("invalid_club_name");
  if (!emailPattern.test(input.operatorEmail)) throw new Error("invalid_email");
  if (input.operatorName.length < 2 || input.operatorName.length > 80) throw new Error("invalid_name");
  if (input.operatorPassword.length < 12 || input.operatorPassword !== operatorPasswordConfirmation) {
    throw new Error("invalid_password");
  }
  return input;
}

export function parseOperatorInput(formData: FormData): OperatorInput {
  const input = {
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    displayName: String(formData.get("displayName") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };
  const passwordConfirmation = String(formData.get("passwordConfirmation") ?? "");
  if (!emailPattern.test(input.email)) throw new Error("invalid_email");
  if (input.displayName.length < 2 || input.displayName.length > 80) throw new Error("invalid_name");
  if (input.password.length < 12 || input.password !== passwordConfirmation) throw new Error("invalid_password");
  return input;
}

/** Today in Asia/Taipei as YYYY-MM-DD, so "today" is not rejected as future. */
export function taipeiToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Mirrors the range the database enforces (1900-01-01 to today). Without this
 * the browser accepted anything shaped like a date, the database rejected it
 * with a single generic code, and the member was told "please try again later"
 * for what was really a typo in the year.
 */
export function isPlausibleBirthDate(value: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(0);
  parsed.setUTCFullYear(year, month - 1, day);
  if (parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day) {
    return false;
  }
  // ISO dates compare correctly as strings.
  return value >= "1900-01-01" && value <= taipeiToday(now);
}

export function parseMemberInput(formData: FormData): MemberInput {
  const input = {
    name: String(formData.get("name") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    birthDate: String(formData.get("birthDate") ?? "").trim() || null,
  };
  if (input.name.length < 2 || input.name.length > 80) throw new Error("invalid_name");
  if (input.email && !emailPattern.test(input.email)) throw new Error("invalid_email");
  if (input.birthDate && !isPlausibleBirthDate(input.birthDate)) throw new Error("invalid_birth_date");
  // Deliberately no "phone or email is required" rule here: this parser is
  // shared with secretary-created members and the invitation flow, where a
  // name-only member is legitimate. Only the self-profile RPC requires a
  // contact, so that check belongs to the caller that hits it.
  return input;
}

export function safeMessage(code?: string): string | null {
  if (!code) return null;
  const messages: Record<string, string> = {
    invalid_credentials: "電子郵件或密碼不正確，請再試一次。",
    invalid_club_code: "社代碼請使用 2–32 個英數字、連字號或底線。",
    invalid_club_name: "請輸入 2–100 個字的扶輪社名稱。",
    invalid_email: "請輸入有效的電子郵件地址。",
    invalid_name: "請輸入 2–80 個字的姓名。",
    forbidden: "您的帳號沒有執行這項操作的權限。",
    duplicate: "社代碼或有效邀請已存在，請確認後再試。",
    member_conflict: "此人目前具有有效社籍，不能同時擔任執行秘書。",
    last_operator: "啟用中的扶輪社至少需要一位執行秘書。",
    last_superadmin: "平台至少需要保留一個啟用中的超級管理員帳號。",
    shared_identity: "此帳號或 LINE 身份由多個扶輪社共用，只有平台管理員可以修改。",
    self_status_change: "不能在目前登入工作階段停用自己的平台帳號。",
    password_login_required: "解除 LINE Login 前必須先具備可用的平台密碼登入方式。",
    line_identity_conflict: "此 LINE 身份已綁定其他帳號，或此帳號已綁定另一個 LINE 身份。",
    line_unbind_membership_mismatch: "找不到此帳號在目前扶輪社的社籍資料，無法解除 LINE Login。",
    invite_not_found: "找不到符合目前登入信箱的有效邀請。",
    invite_failed: "帳號已建立，但設定管理權限時失敗；請稍後重試。",
    invalid_password: "密碼至少需要 12 個字元，且兩次輸入必須相同。",
    recovery_invalid: "密碼重設連結無效、已過期或已使用，請重新申請。",
    line_login_failed: "LINE Login 未完成，請重新開啟邀請後再試一次。",
    line_login_no_active_access: "此 LINE 身份已綁定平台帳號，但尚未完成啟用中的社籍或平台權限。請使用社務管理員最新重發的邀請連結完成加入，不要直接從登入頁重新登入。",
    line_invitation_identity_conflict: "此 LINE 身份已屬於另一筆社員資料。請社務管理員不要重複新增社員，改從原社員紀錄重送邀請，或先合併重複資料。",
    missing_contact: "手機與電子郵件至少需要填寫一項。",
    invalid_birth_date: "生日不正確。請輸入 1900 年 1 月 1 日至今天之間的實際日期。",
    invalid_profile_input: "資料未通過檢查。請確認：姓名必填、手機與電子郵件至少填寫一項、生日介於 1900 年與今天之間。",
    invitation_invalid: "邀請不存在、已取消、已接受或已過期。",
    invitation_email_mismatch: "輸入的 Email 與扶輪社預建的社員資料不一致，請聯絡秘書確認。",
    use_existing_account: "這個 Email 可能已有平台帳號，請先登入；忘記密碼可使用重設功能。",
    password_signin_failed: "平台帳號已建立，但登入未完成。請使用忘記密碼重新設定後登入。",
    member_exists: "這位社員已存在於扶輪社。",
    oa_not_configured: "請先完成 LINE Official Account 設定。",
    oa_or_member_not_found:
      "本社尚未儲存 LINE OA 設定，或這位社員不在本社。請先在上方「OA 設定」儲存後再配對。",
    unexpected: "操作未完成，請稍後再試。",
  };
  return messages[code] ?? messages.unexpected;
}

export function parseNewPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("passwordConfirmation") ?? "");
  if (password.length < 12 || password !== confirmation) throw new Error("invalid_password");
  return password;
}

export function mapDatabaseError(message: string): string {
  if (message.includes("invalid_self_profile_input")) return "invalid_profile_input";
  if (message.includes("invalid_club_name")) return "invalid_club_name";
  if (message.includes("last_active_superadmin")) return "last_superadmin";
  if (message.includes("shared_identity") || message.includes("cross_club_identity")) return "shared_identity";
  if (message.includes("self_account_status") || message.includes("self_membership_suspend")) return "self_status_change";
  if (message.includes("password_login_required")) return "password_login_required";
  if (message.includes("line_identity_already_bound") || message.includes("account_already_has_another_line_identity")) return "line_identity_conflict";
  if (message.includes("account_not_in_club")) return "line_unbind_membership_mismatch";
  // Checked before the generic "required"/"P0002" rules below, which would
  // otherwise swallow it into a message that does not say what to do.
  if (message.includes("oa_or_member_not_found")) return "oa_or_member_not_found";
  if (message.includes("required") || message.includes("42501")) return "forbidden";
  if (message.includes("already_exists") || message.includes("23505")) return "duplicate";
  if (message.includes("active_member")) return "member_conflict";
  if (message.includes("last_active_operator")) return "last_operator";
  if (message.includes("invitation") || message.includes("P0002")) return "invite_not_found";
  return "unexpected";
}

export function safeRedirectPath(value: string | null | undefined, fallback = "/dashboard") {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

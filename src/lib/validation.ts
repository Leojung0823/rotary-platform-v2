export type ClubInput = {
  clubCode: string;
  clubName: string;
  operatorEmail: string;
  operatorName: string;
};

export type OperatorInput = { email: string; displayName: string };
export type MemberInput = { name: string; phone: string; email: string; birthDate: string | null };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clubCodePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/;

export function parseClubInput(formData: FormData): ClubInput {
  const input = {
    clubCode: String(formData.get("clubCode") ?? "").trim().toUpperCase(),
    clubName: String(formData.get("clubName") ?? "").trim(),
    operatorEmail: String(formData.get("operatorEmail") ?? "").trim().toLowerCase(),
    operatorName: String(formData.get("operatorName") ?? "").trim(),
  };
  if (!clubCodePattern.test(input.clubCode)) throw new Error("invalid_club_code");
  if (input.clubName.length < 2 || input.clubName.length > 100) throw new Error("invalid_club_name");
  if (!emailPattern.test(input.operatorEmail)) throw new Error("invalid_email");
  if (input.operatorName.length < 2 || input.operatorName.length > 80) throw new Error("invalid_name");
  return input;
}

export function parseOperatorInput(formData: FormData): OperatorInput {
  const input = {
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    displayName: String(formData.get("displayName") ?? "").trim(),
  };
  if (!emailPattern.test(input.email)) throw new Error("invalid_email");
  if (input.displayName.length < 2 || input.displayName.length > 80) throw new Error("invalid_name");
  return input;
}

export function parseMemberInput(formData: FormData): MemberInput {
  const input = { name: String(formData.get("name") ?? "").trim(), phone: String(formData.get("phone") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(), birthDate: String(formData.get("birthDate") ?? "").trim() || null };
  if (input.name.length < 2 || input.name.length > 80) throw new Error("invalid_name");
  if (!input.phone && !input.email) throw new Error("missing_contact");
  if (input.email && !emailPattern.test(input.email)) throw new Error("invalid_email");
  if (input.birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate)) throw new Error("invalid_birth_date");
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
    invite_not_found: "找不到符合目前登入信箱的有效邀請。",
    invite_failed: "邀請已建立，但郵件暫時無法寄出；請稍後重試。",
    invalid_password: "密碼至少需要 12 個字元，且兩次輸入必須相同。",
    line_login_failed: "LINE Login 未完成，請重新開啟邀請後再試一次。",
    missing_contact: "手機與電子郵件至少需要填寫一項。",
    invalid_birth_date: "生日格式不正確。",
    invitation_invalid: "邀請不存在、已取消或已過期。",
    member_exists: "這位社員已存在於扶輪社。",
    oa_not_configured: "請先完成 LINE Official Account 設定。",
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

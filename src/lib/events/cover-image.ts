export const COVER_BUCKET = "event-covers";

// A phone photo is 2-5MB and several thousand pixels wide; the card renders it
// at well under 800px. Storing the original would exhaust the project's storage
// allowance within a year and make every page load download megabytes, so the
// browser resizes before anything leaves the device.
export const COVER_MAX_EDGE = 1600;
export const COVER_QUALITY = 0.8;
// Backstop only -- a resized photo lands far below this. It also matches the
// bucket's own limit, so a file that would be refused by Storage is refused
// here first, with a message the member can act on.
export const COVER_MAX_BYTES = 2 * 1024 * 1024;
export const COVER_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export function coverObjectPath(clubId: string, eventId: string) {
  return `${clubId}/${eventId}`;
}

export function coverImageError(code: string): string {
  const messages: Record<string, string> = {
    unsupported_type: "請選擇圖片檔（JPG、PNG、WebP 或 iPhone 的 HEIC）。",
    too_large: "圖片太大，請改用小一點的檔案。",
    decode_failed: "無法讀取這張圖片，請換一張試試。",
    upload_failed: "上傳失敗，請稍後再試。",
    forbidden: "目前帳號沒有管理這個活動的權限。",
  };
  return messages[code] ?? "目前無法上傳圖片，請稍後再試。";
}

export function scaledDimensions(width: number, height: number, maxEdge = COVER_MAX_EDGE) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const ratio = maxEdge / longest;
  // Never round down to zero: a 1px edge still has to survive the scale.
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

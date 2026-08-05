const MEMBER_AVATAR_PREFIX = "member-avatar:";

export function avatarPublicUrl(value: string | null | undefined) {
  if (!value) return null;
  if (value.startsWith(MEMBER_AVATAR_PREFIX)) {
    const objectPath = value.slice(MEMBER_AVATAR_PREFIX.length);
    if (!/^[0-9a-f-]{36}\/profile$/iu.test(objectPath)) return null;
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/u, "");
    if (!baseUrl) return null;
    return `${baseUrl}/storage/v1/object/public/member-avatars/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

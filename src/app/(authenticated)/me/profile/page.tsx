import Link from "next/link";
import { updateMyProfileAction } from "@/app/profile-actions";
import { AvatarPhoto } from "@/components/avatar-photo";
import { Button, Field, Input, Notice } from "@/components/ui";
import { UnsavedChangesForm } from "@/components/unsaved-changes-form";
import { avatarPublicUrl } from "@/lib/avatar";
import { createClient } from "@/lib/supabase/server";
import { safeMessage } from "@/lib/validation";

type Center = { profile: { display_name: string; phone: string | null; email: string | null; birth_date: string | null; avatar_url: string | null } };

export default async function MyProfilePage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const [query, supabase] = await Promise.all([searchParams, createClient()]); const result = await supabase.rpc("get_my_identity_center"); const center = result.data as Center | null;
  if (result.error || !center) return <Notice tone="error">個人資料暫時無法載入，請重新整理。</Notice>;
  const avatarUrl = avatarPublicUrl(center.profile.avatar_url);
  return <div className="page-stack narrow"><Link className="back-link" href="/me">← 返回我的</Link><header><h1>我的資料</h1><p>更新照片、姓名與聯絡資料。手機與 Email 至少保留一項。</p></header>{query.success && <Notice tone="success">個人資料已儲存。</Notice>}{query.error && <Notice tone="error">{safeMessage(query.error)}</Notice>}<section className="card"><UnsavedChangesForm action={updateMyProfileAction} className="form-stack" encType="multipart/form-data"><div className="avatar-editor"><div className="avatar profile-avatar">{avatarUrl ? <AvatarPhoto src={avatarUrl} alt="目前的大頭照" /> : center.profile.display_name.slice(0, 1)}</div><div><Field label="照片"><Input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" /></Field><p className="hint">JPG、PNG 或 WebP，檔案上限 5 MB。</p>{avatarUrl && <label className="checkbox-row"><input type="checkbox" name="removeAvatar" /><span>移除目前照片</span></label>}</div></div><Field label="姓名"><Input name="name" required maxLength={160} defaultValue={center.profile.display_name} autoComplete="name" /></Field><Field label="手機"><Input name="phone" maxLength={40} defaultValue={center.profile.phone ?? ""} autoComplete="tel" inputMode="tel" /></Field><Field label="Email"><Input name="email" type="email" maxLength={320} defaultValue={center.profile.email ?? ""} autoComplete="email" /></Field><Field label="生日"><Input name="birthDate" type="date" defaultValue={center.profile.birth_date ?? ""} /></Field><Button className="button-full" type="submit">儲存修改</Button></UnsavedChangesForm></section></div>;
}

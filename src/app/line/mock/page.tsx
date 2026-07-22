import { notFound } from "next/navigation";
import { authorizeMockLineAction } from "./actions";
import { Button, Card, Field, Input, Notice } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function MockLinePage({ searchParams }: { searchParams: Promise<{ state?: string; nonce?: string }> }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  if (process.env.LINE_LOGIN_MODE === "line" || !["localhost", "127.0.0.1"].includes(new URL(siteUrl).hostname)) notFound();
  const { state, nonce } = await searchParams; if (!state || !nonce) notFound();
  return <main className="center-page"><Card className="accept-card"><div className="line-mark">LINE</div><p className="eyebrow">LOCAL MOCK PROVIDER</p><h1>模擬 LINE Login</h1><Notice>此頁只在 localhost 啟用，不會連接 LINE 或傳送任何資料。</Notice><form action={authorizeMockLineAction} className="form-stack accept-form"><input type="hidden" name="state" value={state}/><input type="hidden" name="nonce" value={nonce}/><Field label="LINE 顯示名稱"><Input name="displayName" required defaultValue="測試社員"/></Field><Field label="Mock LINE User ID"><Input name="subject" required defaultValue={`U${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`}/></Field><Field label="LINE Email（選填）"><Input name="email" type="email" defaultValue="member@example.test"/></Field><Button type="submit" className="line-button">同意並登入</Button></form></Card></main>;
}

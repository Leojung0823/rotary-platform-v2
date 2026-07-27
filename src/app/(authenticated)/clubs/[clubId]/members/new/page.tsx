import { randomUUID } from "node:crypto";
import Link from "next/link";
import { createMemberInvitationAction } from "@/app/member-invitation-actions";
import { ClubAdminNav } from "@/components/club-admin-nav";
import { safeMessage } from "@/lib/validation";
import { Button, Card, Field, Input, Select, Notice } from "@/components/ui";

export default async function NewMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { clubId } = await params;
  const message = safeMessage((await searchParams).error);
  const idempotencyKey = randomUUID();
  const importIdempotencyKey = randomUUID();

  return <div className="narrow page-stack">
    <header>
      <Link href={`/clubs/${clubId}/members`} className="back-link">← 返回社員列表</Link>
      <p className="eyebrow">INVITATION FIRST</p>
      <h1>新增社員</h1>
      <p>只輸入扶輪社已經知道的資料。社員接受邀請後，只需確認或補齊缺漏。</p>
    </header>
    <ClubAdminNav clubId={clubId} />
    {message && <Notice tone="error">{message}</Notice>}
    <Card>
      <form action={createMemberInvitationAction} className="form-stack">
        <input type="hidden" name="clubId" value={clubId} />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <Field label="姓名"><Input name="name" required autoComplete="name" /></Field>
        <div className="form-grid">
          <Field label="手機"><Input name="phone" inputMode="tel" autoComplete="tel" /></Field>
          <Field label="Email"><Input name="email" type="email" autoComplete="email" /></Field>
        </div>
        <div className="form-grid">
          <Field label="生日"><Input name="birthDate" type="date" /></Field>
          <Field label="邀請方式">
            <Select name="deliveryMethod" defaultValue="line">
              <option value="line">LINE</option>
              <option value="email">Email</option>
              <option value="qr">QR Code</option>
              <option value="link">複製連結</option>
            </Select>
          </Field>
        </div>
        <Notice>手機與 Email 至少填寫一項；同一份表單重送會沿用相同冪等鍵，不會建立第二筆邀請。</Notice>
        <div className="form-actions">
          <Link className="button button-secondary" href={`/clubs/${clubId}/members`}>取消</Link>
          <Button type="submit">建立社員與邀請</Button>
        </div>
      </form>
    </Card>
    <Card>
      <h2>Excel 批次匯入</h2>
      <p>下載範本或上傳 `.xlsx`；同一份表單重送會以批次 key 與列號重用每列邀請。</p>
      <div className="form-actions">
        <a className="button button-secondary" href={`/api/v1/clubs/${clubId}/members/template`}>下載範本</a>
        <form action={`/api/v1/clubs/${clubId}/members/import`} method="post" encType="multipart/form-data">
          <input type="hidden" name="idempotencyKey" value={importIdempotencyKey} />
          <Input name="file" type="file" accept=".xlsx" required />
          <Button type="submit">匯入 Excel</Button>
        </form>
      </div>
    </Card>
  </div>;
}

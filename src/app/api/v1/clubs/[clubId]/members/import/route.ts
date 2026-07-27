import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function validBatchKey(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return /^[A-Za-z0-9._:-]{8,160}$/.test(key) ? key : null;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ clubId: string }> }) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin && origin !== process.env.NEXT_PUBLIC_SITE_URL) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { clubId } = await params;
  const form = await request.formData();
  const file = form.get("file");
  const batchKey = validBatchKey(form.get("idempotencyKey"));
  if (!batchKey || !(file instanceof File) || file.size > 5_000_000) {
    return NextResponse.json({ error: "invalid_file" }, { status: 400 });
  }

  const workbook = new ExcelJS.Workbook();
  const upload = Buffer.from(await file.arrayBuffer()) as unknown as Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(upload);
  const source = workbook.worksheets[0];
  if (!source || source.rowCount > 501) {
    return NextResponse.json({ error: "invalid_rows" }, { status: 400 });
  }

  const output = new ExcelJS.Workbook();
  const sheet = output.addWorksheet("匯入結果");
  sheet.columns = [
    { header: "姓名", key: "name", width: 20 },
    { header: "結果", key: "result", width: 16 },
    { header: "邀請連結（只顯示本次）", key: "url", width: 90 },
  ];

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  for (let index = 2; index <= source.rowCount; index += 1) {
    const row = source.getRow(index);
    const name = String(row.getCell(1).text).trim();
    if (!name) continue;

    const result = await supabase.rpc("create_member_invitation", {
      p_club_id: clubId,
      p_name: name,
      p_phone: String(row.getCell(2).text).trim() || null,
      p_email: String(row.getCell(3).text).trim().toLowerCase() || null,
      p_birth_date: String(row.getCell(4).text).trim() || null,
      p_delivery_method: String(row.getCell(5).text).trim() || "link",
      p_idempotency_key: `${batchKey}:${index}`,
    });
    const token = result.error ? null : (result.data as { token?: string | null }).token;
    sheet.addRow({
      name,
      result: result.error ? "失敗" : token ? "已建立" : "已處理（冪等重送）",
      url: token ? `${siteUrl}/join?token=${token}` : "",
    });
  }

  sheet.getRow(1).font = { bold: true };
  const buffer = await output.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": "attachment; filename=rotary-member-import-results.xlsx",
      "cache-control": "no-store",
    },
  });
}

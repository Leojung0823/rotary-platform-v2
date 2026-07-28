import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_: Request, { params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params; const supabase = await createClient(); const permission = await supabase.rpc("list_my_permissions", { p_club_id: clubId });
  if (permission.error || !(permission.data as { permission_key: string }[]).some(item => item.permission_key === "member.manage")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("社員匯入");
  sheet.columns = [{ header: "姓名*", key: "name", width: 20 }, { header: "手機", key: "phone", width: 18 }, { header: "Email", key: "email", width: 28 }, { header: "生日(YYYY-MM-DD)", key: "birth", width: 20 }, { header: "邀請方式(line/email/qr/link)", key: "delivery", width: 30 }];
  sheet.addRow({ name: "王小明", phone: "0912345678", email: "member@example.test", birth: "1980-01-01", delivery: "line" }); sheet.getRow(1).font = { bold: true };
  const buffer = await workbook.xlsx.writeBuffer(); return new NextResponse(Buffer.from(buffer), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": "attachment; filename=rotary-member-import-template.xlsx", "cache-control": "no-store" } });
}

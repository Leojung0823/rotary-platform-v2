import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_: Request, { params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params; const supabase = await createClient(); const result = await supabase.rpc("list_club_members", { p_club_id: clubId, p_query: null, p_status: null });
  if (result.error) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("社員");
  sheet.columns = [{ header: "姓名", key: "name", width: 20 }, { header: "手機", key: "phone", width: 18 }, { header: "Email", key: "email", width: 28 }, { header: "生日", key: "birth", width: 14 }, { header: "社籍狀態", key: "status", width: 14 }, { header: "LINE Login", key: "line", width: 14 }, { header: "LINE OA", key: "oa", width: 14 }];
  for (const row of result.data as Record<string, unknown>[]) sheet.addRow({ name: row.display_name, phone: row.phone, email: row.email, birth: row.birth_date, status: row.membership_status, line: row.line_identity_id ? "已綁定" : "未綁定", oa: row.oa_follower_id ? "已配對" : "未配對" });
  sheet.getRow(1).font = { bold: true }; sheet.autoFilter = { from: "A1", to: "G1" }; sheet.views = [{ state: "frozen", ySplit: 1 }];
  const buffer = await workbook.xlsx.writeBuffer(); return new NextResponse(Buffer.from(buffer), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": "attachment; filename=rotary-members.xlsx", "cache-control": "no-store" } });
}

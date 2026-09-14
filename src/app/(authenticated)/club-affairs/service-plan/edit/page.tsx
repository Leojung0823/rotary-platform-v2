import type { Metadata } from "next";
import Link from "next/link";
import { saveClubServicePlanAction } from "@/app/service-plan-actions";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { resolveExperienceContext } from "@/lib/experience-context.server";
import { createClient } from "@/lib/supabase/server";
import { safeMessage } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "撰寫年度服務計劃" };

type AffairsPage = {
  start_year: number;
  can_manage_plan: boolean;
  service_plan: { title: string; body: string; plan_status: string } | null;
};

export default async function ServicePlanEditPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; error?: string }>;
}) {
  const query = await searchParams;
  const requestedYear = Number.parseInt(query.year ?? "", 10);
  const resolution = await resolveExperienceContext(null);
  const activeClubId = resolution.ok ? resolution.context.activeClubId : null;
  if (!activeClubId) return <Notice tone="error">目前沒有有效社籍。</Notice>;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_club_affairs_page", {
    p_club_id: activeClubId,
    p_start_year: Number.isNaN(requestedYear) ? null : requestedYear,
  });
  if (error) return <Notice tone="error">目前無法載入服務計劃。</Notice>;

  const page = data as AffairsPage;
  // The server refuses the write anyway; this keeps someone without the
  // permission from being shown a form that can only fail.
  if (!page.can_manage_plan) return <Notice tone="error">您沒有編輯年度服務計劃的權限。</Notice>;

  const plan = page.service_plan;

  return <div className="page-stack">
    <header className="page-header">
      <div>
        <p className="eyebrow">{page.start_year}–{page.start_year + 1} 年度</p>
        <h1>年度服務計劃</h1>
        <p>社員會在「社務」看到這份計劃。存成草稿時只有您看得到。</p>
      </div>
      <Link className="button button-secondary" href="/club-affairs">← 回社務</Link>
    </header>

    {query.error && <Notice tone="error">{safeMessage(query.error)}</Notice>}

    <Card>
      <form action={saveClubServicePlanAction} className="form-stack">
        <input type="hidden" name="startYear" value={page.start_year} />
        <Field label="計劃標題">
          <Input name="title" required maxLength={180} defaultValue={plan?.title ?? ""}
            placeholder="例如：2026–27 年度服務計劃" />
        </Field>
        <Field label="計劃內容">
          {/* Officers paste a plan written elsewhere, so the box is large and
              the paragraphing they typed is what members will read. */}
          <textarea
            name="body"
            required
            rows={18}
            maxLength={20000}
            defaultValue={plan?.body ?? ""}
            placeholder="說明本年度的服務主軸、重點計劃與期待社員參與的方式。換行與分段會照原樣顯示給社員。"
          />
        </Field>
        <div className="form-actions">
          <Button type="submit" name="publish" value="draft" className="button-secondary">儲存草稿</Button>
          <Button type="submit" name="publish" value="publish">發布給社員</Button>
        </div>
      </form>
    </Card>
  </div>;
}

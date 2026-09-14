import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button, Card, Field, Input, Notice, Select } from "@/components/ui";
import { saveClubServicePlanV2Action } from "@/app/service-plan-actions";
import {
  SERVICE_PLAN_CATEGORIES,
  servicePlanSections,
  type ServicePlan,
} from "@/lib/club-affairs/service-plan";
import { requireIdentity } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { safeMessage } from "@/lib/validation";
import styles from "./service-plan.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "年度服務計劃管理" };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type AffairsPage = {
  club: { club_id: string; club_code: string; club_name: string } | null;
  start_year: number;
  can_manage_plan: boolean;
  service_plan: ServicePlan | null;
};

const progressOptions = [
  { value: "planned", label: "規劃中" },
  { value: "in_progress", label: "進行中" },
  { value: "completed", label: "已完成" },
] as const;

function yearLabel(startYear: number) {
  return `${startYear}–${startYear + 1}`;
}

export default async function ServicePlanManagementPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ mode?: string; year?: string; success?: string; error?: string }>;
}) {
  const [, { clubId }, query] = await Promise.all([requireIdentity(), params, searchParams]);
  if (!uuidPattern.test(clubId)) notFound();
  if (query.mode !== "management") {
    const canonicalQuery = new URLSearchParams({ mode: "management" });
    if (query.year) canonicalQuery.set("year", query.year);
    redirect(`/clubs/${encodeURIComponent(clubId)}/service-plan?${canonicalQuery.toString()}`);
  }

  const requestedYear = Number.parseInt(query.year ?? "", 10);
  const { data, error } = await (await createClient()).rpc("get_club_affairs_page", {
    p_club_id: clubId,
    p_start_year: Number.isNaN(requestedYear) ? null : requestedYear,
    p_as_member: false,
  });
  if (error?.code === "42501") redirect("/access-denied");
  if (error || !data) {
    return <div className="page-stack">
      <header className="page-header">
        <div><p className="eyebrow">社務管理</p><h1>年度服務計劃</h1></div>
      </header>
      <Notice tone="error">目前無法確認這個扶輪社的服務計劃權限，請稍後重新整理。</Notice>
    </div>;
  }

  const page = data as AffairsPage;
  if (!page.club || !page.can_manage_plan) redirect("/access-denied");

  const plan = page.service_plan;
  const sections = servicePlanSections(plan?.sections);
  const memberPath = `/club-affairs?mode=member&year=${page.start_year}`;
  const overviewPath = "/dashboard?mode=management";

  return <div className="page-stack">
    <header className="page-header">
      <div>
        <p className="eyebrow">{page.club.club_code} · 社務管理</p>
        <h1>年度服務計劃</h1>
        <p>{page.club.club_name}的 {yearLabel(page.start_year)} 年度方向、執行成果與社員參與方式。</p>
      </div>
      <div className="form-actions">
        <a className="button button-secondary" href={memberPath}>查看社員頁</a>
        <Link className="button button-secondary" href={overviewPath}>返回社務總覽</Link>
      </div>
    </header>

    {query.success === "saved" && <Notice tone="success">年度服務計劃已儲存。</Notice>}
    {query.error && <Notice tone="error">{safeMessage(query.error)}</Notice>}

    <Notice>
      可以先儲存草稿。要發布給社員，四類服務都必須填寫「年度目標、執行活動、最新成果、社員參與」；「下一步」可以之後補充。
    </Notice>

    <form action={saveClubServicePlanV2Action} className="form-stack">
      <input type="hidden" name="clubId" value={clubId} />
      <input type="hidden" name="startYear" value={page.start_year} />

      <Card>
        <div className="section-heading">
          <div><p className="eyebrow">年度總覽</p><h2>先讓社員知道今年要往哪裡走</h2></div>
        </div>
        <div className="form-stack">
          <Field label="計劃標題">
            <Input name="title" required maxLength={180} defaultValue={plan?.title ?? ""}
              placeholder={`例如：${yearLabel(page.start_year)} 年度服務計劃`} />
          </Field>
          <Field label="年度主軸" hint="一句話說明今年最想完成的方向，可留白但建議填寫。">
            <Input name="annualTheme" maxLength={180} defaultValue={plan?.annual_theme ?? ""}
              placeholder="例如：以關懷凝聚社員，以行動服務社區" />
          </Field>
          <Field label="年度總覽" hint="請說明整體方向、重要時間點與年度期待。">
            <textarea className="input" name="body" required rows={8} maxLength={20000}
              defaultValue={plan?.body ?? ""}
              placeholder="說明本年度服務計劃的背景、重點與希望帶給社員及社區的改變。" />
          </Field>
          <Field label="社員參與邀請" hint="告訴社員可以用什麼方式加入，不必等幹部分派。">
            <textarea className="input" name="memberInvitation" rows={5} maxLength={2000}
              defaultValue={plan?.member_invitation ?? ""}
              placeholder="例如：歡迎社員依專長加入任一服務小組，也可以直接向幹部提出新的服務點子。" />
          </Field>
        </div>
      </Card>

      <section className={styles.editorSections} aria-labelledby="service-sections-heading">
        <div className="section-heading">
          <div><p className="eyebrow">四大服務面向</p><h2 id="service-sections-heading">把計劃寫成社員看得懂的進度</h2></div>
        </div>
        <div className="form-stack">
          {sections.map((section, index) => {
            const category = SERVICE_PLAN_CATEGORIES[index];
            return <Card className={styles.editorSection} key={category.key}>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">服務面向 {index + 1}</p>
                  <h2>{category.label}</h2>
                  <p>{category.description}</p>
                </div>
              </div>
              <p className={styles.editorPrompt}>{category.prompt}</p>
              <div className="form-grid">
                <Field label="進度">
                  <Select name={`section_${category.key}_status`} defaultValue={section.progress_status}>
                    {progressOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </Field>
                <Field label="年度目標" hint="發布時必填">
                  <textarea className="input" name={`section_${category.key}_annualGoal`} rows={4} maxLength={4000}
                    defaultValue={section.annual_goal} placeholder="今年希望完成的具體目標。" />
                </Field>
                <Field label="執行活動" hint="發布時必填">
                  <textarea className="input" name={`section_${category.key}_activities`} rows={5} maxLength={8000}
                    defaultValue={section.activities} placeholder="已安排或正在進行的活動、合作對象與時間。" />
                </Field>
                <Field label="最新成果" hint="發布時必填；尚未開始可先儲存草稿">
                  <textarea className="input" name={`section_${category.key}_latestResult`} rows={5} maxLength={8000}
                    defaultValue={section.latest_result} placeholder="目前已完成什麼，帶來什麼結果？" />
                </Field>
                <Field label="下一步">
                  <textarea className="input" name={`section_${category.key}_nextStep`} rows={4} maxLength={4000}
                    defaultValue={section.next_step} placeholder="接下來準備完成什麼？" />
                </Field>
                <Field label="社員參與" hint="發布時必填">
                  <textarea className="input" name={`section_${category.key}_memberParticipation`} rows={4} maxLength={4000}
                    defaultValue={section.member_participation} placeholder="社員可以報名、提供專長、邀請夥伴或用其他方式加入。" />
                </Field>
              </div>
            </Card>;
          })}
        </div>
      </section>

      <div className="form-actions">
        <Button type="submit" name="publish" value="draft" className="button-secondary">儲存草稿</Button>
        <Button type="submit" name="publish" value="publish">發布給社員</Button>
      </div>
    </form>
  </div>;
}

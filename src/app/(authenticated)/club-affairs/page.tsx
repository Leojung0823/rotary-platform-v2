import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Notice } from "@/components/ui";
import {
  SERVICE_PLAN_CATEGORIES,
  SERVICE_PLAN_STATUS_LABELS,
  servicePlanSections,
  type ServicePlan,
  type ServicePlanProgressStatus,
} from "@/lib/club-affairs/service-plan";
import { createClient } from "@/lib/supabase/server";
import { resolveExperienceContext } from "@/lib/experience-context.server";
import styles from "./club-affairs.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "社務" };

type AffairsPage = {
  club: { club_id: string; club_code: string; club_name: string; english_name: string | null; member_count: number } | null;
  officers: Array<{ role_key: string; display_name: string }>;
  start_year: number;
  can_manage_plan: boolean;
  service_plan: ServicePlan | null;
  plan_years: number[];
};

const roleLabel: Record<string, string> = { president: "社長", secretary: "秘書", finance: "財務" };

const updatedFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  dateStyle: "medium",
});

function rotaryYearLabel(startYear: number) {
  return `${startYear}–${startYear + 1}`;
}

function statusTone(status: ServicePlanProgressStatus) {
  if (status === "completed") return "success" as const;
  if (status === "in_progress") return "warning" as const;
  return "neutral" as const;
}

function planValue(value: string) {
  return value.trim() || "尚未補充";
}

export default async function ClubAffairsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const query = await searchParams;
  const requestedYear = Number.parseInt(query.year ?? "", 10);
  const supabase = await createClient();
  const resolution = await resolveExperienceContext(null);
  const activeClubId = resolution.ok ? resolution.context.activeClubId : null;

  if (!activeClubId) {
    return <Notice tone="error">目前沒有有效社籍，無法查看社務資訊。</Notice>;
  }

  const { data, error } = await supabase.rpc("get_club_affairs_page", {
    p_club_id: activeClubId,
    p_start_year: Number.isNaN(requestedYear) ? null : requestedYear,
    p_as_member: true,
  });
  if (error) return <Notice tone="error">目前無法載入社務資訊，請稍後重新整理。</Notice>;

  const page = data as AffairsPage;
  const club = page.club;
  if (!club) return <Notice tone="error">找不到這個扶輪社。</Notice>;

  return <div className="page-stack">
    <header className="page-header">
      <div>
        <p className="eyebrow">社務 · {club.club_code}</p>
        <h1>{club.club_name}</h1>
        {club.english_name && <p className={styles.englishName}>{club.english_name}</p>}
      </div>
    </header>

    <Card>
      <div className="section-heading">
        <div><p className="eyebrow">本社</p><h2>社團資料</h2></div>
        <span>{club.member_count} 位社員</span>
      </div>
      {page.officers.length > 0
        ? <ul className={styles.officerList}>
          {page.officers.map((officer) => <li key={`${officer.role_key}-${officer.display_name}`}>
            <Badge tone="neutral">{roleLabel[officer.role_key] ?? officer.role_key}</Badge>
            <strong>{officer.display_name}</strong>
          </li>)}
        </ul>
        : <p className="subtle">尚未指派社長、秘書或財務。</p>}
    </Card>

    <Card>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{rotaryYearLabel(page.start_year)} 年度</p>
          <h2>年度服務計劃</h2>
        </div>
        {page.can_manage_plan && <Link
          className="button button-secondary"
          href={`/club-affairs/service-plan/edit?mode=management&year=${page.start_year}`}
        >{page.service_plan ? "編輯" : "撰寫"}</Link>}
      </div>

      {page.service_plan
        ? <>
          <div className={styles.planIntro}>
            <h3 className={styles.planTitle}>{page.service_plan.title}</h3>
            {page.service_plan.annual_theme.trim() && <p className={styles.planTheme}>
              <strong>年度主軸：</strong>{page.service_plan.annual_theme}
            </p>}
            <p className={styles.planBody}>{page.service_plan.body}</p>
          </div>
          {page.service_plan.member_invitation.trim() && <div className={styles.memberInvitation}>
            <p className="eyebrow">一起參與</p>
            <h3>社員可以怎麼加入</h3>
            <p className={styles.planBody}>{page.service_plan.member_invitation}</p>
          </div>}
          <div className={styles.serviceCategoryGrid}>
            {servicePlanSections(page.service_plan.sections).map((section, index) => {
              const category = SERVICE_PLAN_CATEGORIES[index];
              return <article className={styles.serviceCategory} key={category.key}>
                <div className={styles.serviceCategoryHeader}>
                  <div>
                    <p className="eyebrow">服務面向 {index + 1}</p>
                    <h3>{category.label}</h3>
                  </div>
                  <Badge tone={statusTone(section.progress_status)}>
                    {SERVICE_PLAN_STATUS_LABELS[section.progress_status]}
                  </Badge>
                </div>
                <p className={styles.serviceCategoryDescription}>{category.description}</p>
                <dl className={styles.planFacts}>
                  <div className={styles.planFact}>
                    <dt>年度目標</dt><dd>{planValue(section.annual_goal)}</dd>
                  </div>
                  <div className={styles.planFact}>
                    <dt>執行活動</dt><dd>{planValue(section.activities)}</dd>
                  </div>
                  <div className={styles.planFact}>
                    <dt>最新成果</dt><dd>{planValue(section.latest_result)}</dd>
                  </div>
                  <div className={styles.planFact}>
                    <dt>下一步</dt><dd>{planValue(section.next_step)}</dd>
                  </div>
                  <div className={styles.planFact}>
                    <dt>社員參與</dt><dd>{planValue(section.member_participation)}</dd>
                  </div>
                </dl>
              </article>;
            })}
          </div>
          <p className="subtle">更新於 {updatedFormatter.format(new Date(page.service_plan.updated_at))}</p>
        </>
        : <p className="subtle">
          本年度的服務計劃尚未發布。
        </p>}

      {page.plan_years.length > 1 && <div className={styles.yearLinks}>
        <span className="subtle">其他年度：</span>
        {page.plan_years.filter((year) => year !== page.start_year).map((year) => <Link
          key={year}
          href={`/club-affairs?year=${year}`}
        >{rotaryYearLabel(year)}</Link>)}
      </div>}
    </Card>

    <Card>
      <div className="section-heading">
        <div><p className="eyebrow">社務文件</p><h2>文件中心</h2></div>
      </div>
      <p>章程、會議紀錄、年度成果與交接文件都收在這裡。</p>
      <Link className="card-link" href={`/archives?clubId=${encodeURIComponent(club.club_id)}&mode=member`}>開啟文件中心 →</Link>
    </Card>
  </div>;
}

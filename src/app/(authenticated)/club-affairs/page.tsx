import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Notice } from "@/components/ui";
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
  service_plan: { title: string; body: string; plan_status: string; published_at: string | null; updated_at: string } | null;
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
          href={`/club-affairs/service-plan/edit?year=${page.start_year}`}
        >{page.service_plan ? "編輯" : "撰寫"}</Link>}
      </div>

      {page.service_plan
        ? <>
          {page.service_plan.plan_status === "draft" && <Notice tone="info">
            這份計劃還是草稿，只有您看得到。發布後社員才會看到。
          </Notice>}
          <h3 className={styles.planTitle}>{page.service_plan.title}</h3>
          {/* The plan is written as prose with the officer's own paragraphing,
              which is the structure of the document. */}
          <p className={styles.planBody}>{page.service_plan.body}</p>
          <p className="subtle">更新於 {updatedFormatter.format(new Date(page.service_plan.updated_at))}</p>
        </>
        : <p className="subtle">
          {page.can_manage_plan
            ? "本年度還沒有服務計劃，點「撰寫」開始。"
            : "本年度的服務計劃尚未發布。"}
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
      <Link className="card-link" href="/archives">開啟文件中心 →</Link>
    </Card>
  </div>;
}

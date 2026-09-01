import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Card, EmptyState, Field, Input, Notice, Select } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import {
  archiveCategories,
  archiveCategoryLabels,
  parseArchivePageProjection,
  rotaryYearLabel,
  type ArchiveCategory,
  type ChecklistStatus,
  type HandoverStatus,
} from "@/lib/archive/contracts";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { createClient } from "@/lib/supabase/server";
import styles from "./archives.module.css";

const successMessages: Record<string, string> = {
  year_created: "扶輪年度與交接清單已建立。",
  year_updated: "年度基本資料已更新。",
  item_created: "文件項目已建立，現在可以上傳第一個版本。",
  item_updated: "文件說明與保密級別已更新。",
  item_archived: "文件項目已封存，歷史版本仍保留。",
  version_uploaded: "新文件版本已安全上傳。",
  checklist_updated: "交接清單已更新。",
  handover_confirmed: "交接確認已留下姓名與時間紀錄。",
};

const errorMessages: Record<string, string> = {
  invalid_input: "輸入內容不完整或格式不正確。",
  already_exists: "這個扶輪年度已經建立。",
  checklist_incomplete: "必要交接項目尚未全部確認，現在不能完成交接。",
  forbidden: "您沒有執行這項操作的權限。",
  unexpected: "操作沒有完成，請稍後再試。",
};

const handoverLabels: Record<HandoverStatus, string> = {
  preparation: "準備中",
  awaiting_confirmation: "待新舊幹部確認",
  completed: "已交接",
  needs_update: "需補件",
};

function statusTone(status: HandoverStatus | ChecklistStatus): "neutral" | "success" | "warning" | "danger" {
  if (status === "completed") return "success";
  if (status === "needs_update") return "danger";
  if (status === "preparation") return "warning";
  return "neutral";
}

function bytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export default async function ArchivesPage({
  searchParams,
}: {
  searchParams: Promise<{ clubId?: string; yearId?: string; q?: string; category?: string; success?: string; error?: string }>;
}) {
  const [identity, query] = await Promise.all([requireIdentity(), searchParams]);
  const evaluation = await evaluateCurrentFeatureFlag({
    key: "archive_handover_v1",
    subjectUuid: identity.id,
  });
  if (!evaluation.enabled) notFound();

  const supabase = await createClient();
  const result = await supabase.rpc("get_my_archive_page", {
    p_club_id: query.clubId ?? null,
    p_rotary_year_id: query.yearId ?? null,
    p_query: query.q?.trim().slice(0, 100) || null,
    p_category: archiveCategories.includes(query.category as ArchiveCategory) ? query.category : null,
  });
  if (result.error || !result.data) return <div className="page-stack"><ArchiveHeader /><Notice tone="error">目前無法確認您可查看的社務文件。</Notice></div>;

  let page;
  try {
    page = parseArchivePageProjection(result.data);
  } catch {
    return <div className="page-stack"><ArchiveHeader /><Notice tone="error">文件資料格式不完整，系統已停止顯示，避免跨社資料混用。</Notice></div>;
  }
  const selectedClub = page.clubs.find((club) => club.clubId === page.selectedClubId) ?? null;
  const selectedYear = page.years.find((year) => year.id === page.selectedYearId) ?? null;

  return <div className="page-stack">
    <ArchiveHeader clubId={page.selectedClubId} canManage={page.canManage} />
    {query.success && successMessages[query.success] && <Notice tone="success">{successMessages[query.success]}</Notice>}
    {query.error && <Notice tone="error">{errorMessages[query.error] ?? errorMessages.unexpected}</Notice>}

    {page.clubs.length > 1 && <form action="/archives" className="inline-form">
      <Field label="扶輪社"><Select name="clubId" defaultValue={page.selectedClubId ?? ""}>{page.clubs.map((club) => <option key={club.clubId} value={club.clubId}>{club.clubName}</option>)}</Select></Field>
      <Button type="submit">切換扶輪社</Button>
    </form>}

    {!selectedClub ? <EmptyState title="沒有可查看的社務文件" body="有效社員或有社務管理權限的幹部才可以使用。" /> : <>
      <section>
        <div className="section-heading"><div><p className="eyebrow">{selectedClub.clubCode}</p><h2>扶輪年度</h2></div>{page.canManage && <Badge tone="neutral">幹部管理</Badge>}</div>
        {page.years.length > 0 && <nav className="tabs" aria-label="扶輪年度">
          {page.years.map((year) => <Link key={year.id} href={`/archives?clubId=${selectedClub.clubId}&yearId=${year.id}`} aria-current={year.id === page.selectedYearId ? "page" : undefined}>{rotaryYearLabel(year.startYear)}</Link>)}
        </nav>}
      </section>

      {!selectedYear ? <EmptyState title="尚未建立扶輪年度" body="幹部建立年度後，才能整理文件版本與交接清單。" /> : <>
        <Card className={styles.yearSummary}>
          <div>
            <p className="eyebrow">{rotaryYearLabel(selectedYear.startYear)} 扶輪年度</p>
            <h2>{selectedYear.theme ?? "尚未填寫年度主題"}</h2>
            <p>社長：{selectedYear.presidentName ?? "未填"}　秘書：{selectedYear.secretaryName ?? "未填"}</p>
          </div>
          <div className={styles.yearActions}>
            <Badge tone={statusTone(selectedYear.handoverStatus)}>{handoverLabels[selectedYear.handoverStatus]}</Badge>
            <a className="button button-secondary" href={`/api/v1/archive/manifest?club_id=${selectedClub.clubId}&year_id=${selectedYear.id}`}>下載文件清冊 CSV</a>
          </div>
        </Card>

        <section>
          <div className="section-heading"><h2>年度文件</h2><span>{page.items.length} 個項目</span></div>
          <form className="inline-form" action="/archives">
            <input type="hidden" name="clubId" value={selectedClub.clubId} /><input type="hidden" name="yearId" value={selectedYear.id} />
            <Field label="搜尋"><Input name="q" maxLength={100} defaultValue={query.q ?? ""} placeholder="標題、說明、資料夾或標籤" /></Field>
            <Field label="分類"><Select name="category" defaultValue={query.category ?? ""}><option value="">全部分類</option>{archiveCategories.map((item) => <option key={item} value={item}>{archiveCategoryLabels[item]}</option>)}</Select></Field>
            <Button type="submit">搜尋</Button>
          </form>

          {page.items.length === 0 ? <EmptyState title="找不到文件" body="請調整搜尋條件；幹部也可以先建立文件項目。" /> : <div className={styles.documentList}>
            {page.items.map((item) => <Card key={item.id} className={styles.documentCard}>
              <div className={styles.documentHeading}>
                <div><span className="club-code">{archiveCategoryLabels[item.category]} · {item.folderPath}</span><h3>{item.title}</h3></div>
                <Badge tone={item.confidentiality === "officers_only" ? "warning" : "neutral"}>{item.confidentiality === "officers_only" ? "僅幹部" : "社內"}</Badge>
              </div>
              {item.description && <p>{item.description}</p>}
              {item.tags.length > 0 && <div className={styles.tags}>{item.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}

              <div className={styles.versionList}>
                <strong>歷史版本（只能新增，不會覆蓋）</strong>
                {item.versions.length === 0 ? <p>尚未上傳檔案。</p> : item.versions.map((version) => <div key={version.id} className={styles.versionRow}>
                  <span><strong>v{version.versionNumber}</strong> {version.originalFilename}<small>{bytes(version.fileSizeBytes)} · {new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium" }).format(new Date(version.createdAt))}{version.changeSummary ? ` · ${version.changeSummary}` : ""}</small></span>
                  <a className="button button-secondary" href={`/api/v1/archive/versions/${version.id}/download?club_id=${selectedClub.clubId}`}>下載</a>
                </div>)}
              </div>

            </Card>)}
          </div>}
        </section>
      </>}
    </>}
  </div>;
}

function ArchiveHeader({ clubId, canManage = false }: { clubId?: string | null; canManage?: boolean }) {
  return <header className="page-header"><div><p className="eyebrow">社務傳承</p><h1>文件中心與年度交接</h1><p>依扶輪年度保存文件版本，讓新舊幹部知道資料是否完整、是否已收到。</p></div><div className="form-actions">{clubId && canManage && <a className="button" href={`/clubs/${encodeURIComponent(clubId)}/archives?mode=management`}>幹部管理</a>}<Link className="button button-secondary" href="/features">返回功能總覽</Link></div></header>;
}

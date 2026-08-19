import Link from "next/link";
import {
  archiveArchiveItemAction,
  confirmArchiveHandoverAction,
  createArchiveItemAction,
  createRotaryYearAction,
  updateArchiveItemAction,
  updateHandoverChecklistAction,
  updateRotaryYearAction,
} from "@/app/archive-actions";
import { ArchiveUploadForm } from "@/components/archive/archive-upload-form";
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

const checklistLabels: Record<ChecklistStatus, string> = {
  pending: "待整理",
  ready: "已備妥",
  confirmed: "已確認",
  needs_update: "需補件",
};

function statusTone(status: HandoverStatus | ChecklistStatus): "neutral" | "success" | "warning" | "danger" {
  if (status === "completed" || status === "confirmed") return "success";
  if (status === "needs_update") return "danger";
  if (status === "preparation" || status === "pending") return "warning";
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
  await requireIdentity();
  const query = await searchParams;
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
    <ArchiveHeader />
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
        {page.canManage && <details className={styles.managerPanel} open={page.years.length === 0}>
          <summary>＋ 建立扶輪年度</summary>
          <form action={createRotaryYearAction} className="form-grid">
            <input type="hidden" name="clubId" value={selectedClub.clubId} />
            <Field label="起始年份" hint="例如 2026 代表 2026/7/1–2027/6/30"><Input name="startYear" type="number" min={2000} max={2200} required /></Field>
            <Field label="年度主題"><Input name="theme" maxLength={160} /></Field>
            <Field label="社長"><Input name="presidentName" maxLength={160} /></Field>
            <Field label="秘書"><Input name="secretaryName" maxLength={160} /></Field>
            <Button type="submit">建立年度與清單</Button>
          </form>
        </details>}
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
          {page.canManage && <details className={styles.fullWidth}>
            <summary>修改年度資料</summary>
            <form action={updateRotaryYearAction} className="form-grid">
              <input type="hidden" name="clubId" value={selectedClub.clubId} /><input type="hidden" name="yearId" value={selectedYear.id} />
              <Field label="年度主題"><Input name="theme" maxLength={160} defaultValue={selectedYear.theme ?? ""} /></Field>
              <Field label="社長"><Input name="presidentName" maxLength={160} defaultValue={selectedYear.presidentName ?? ""} /></Field>
              <Field label="秘書"><Input name="secretaryName" maxLength={160} defaultValue={selectedYear.secretaryName ?? ""} /></Field>
              <Button type="submit">儲存年度資料</Button>
            </form>
          </details>}
        </Card>

        {page.canManage && page.missingRequiredCategories.length > 0 && <Notice tone="error">
          文件斷層提醒：尚缺 {page.missingRequiredCategories.map((item) => archiveCategoryLabels[item]).join("、")} 的可下載版本。
        </Notice>}

        <section>
          <div className="section-heading"><h2>年度文件</h2><span>{page.items.length} 個項目</span></div>
          <form className="inline-form" action="/archives">
            <input type="hidden" name="clubId" value={selectedClub.clubId} /><input type="hidden" name="yearId" value={selectedYear.id} />
            <Field label="搜尋"><Input name="q" maxLength={100} defaultValue={query.q ?? ""} placeholder="標題、說明、資料夾或標籤" /></Field>
            <Field label="分類"><Select name="category" defaultValue={query.category ?? ""}><option value="">全部分類</option>{archiveCategories.map((item) => <option key={item} value={item}>{archiveCategoryLabels[item]}</option>)}</Select></Field>
            <Button type="submit">搜尋</Button>
          </form>

          {page.canManage && <details className={styles.managerPanel}>
            <summary>＋ 建立文件項目</summary>
            <ArchiveItemForm clubId={selectedClub.clubId} yearId={selectedYear.id} />
          </details>}

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

              {page.canManage && <div className={styles.managementGrid}>
                <details><summary>上傳新版本</summary><ArchiveUploadForm clubId={selectedClub.clubId} yearId={selectedYear.id} itemId={item.id} /></details>
                <details><summary>修改文件說明</summary><ArchiveItemForm clubId={selectedClub.clubId} yearId={selectedYear.id} item={item} /></details>
                <form action={archiveArchiveItemAction}><input type="hidden" name="clubId" value={selectedClub.clubId} /><input type="hidden" name="yearId" value={selectedYear.id} /><input type="hidden" name="itemId" value={item.id} /><Button type="submit" className="button-danger">封存項目</Button></form>
              </div>}
            </Card>)}
          </div>}
        </section>

        {page.canManage && <section>
          <div className="section-heading"><div><p className="eyebrow">年度交接</p><h2>交接清單與確認</h2></div><Badge tone={statusTone(selectedYear.handoverStatus)}>{handoverLabels[selectedYear.handoverStatus]}</Badge></div>
          <Notice>先把必要項目連到文件並設為「已確認」。最後需由兩個不同帳號，分別以卸任與新任幹部身分確認，才會顯示「已交接」。</Notice>
          <div className={styles.checklistList}>{page.checklist.map((entry) => <Card key={entry.id} className={styles.checklistCard}>
            <div><strong>{entry.label}</strong><small>{archiveCategoryLabels[entry.category]}{entry.isRequired ? " · 必要" : ""}</small></div>
            <Badge tone={statusTone(entry.status)}>{checklistLabels[entry.status]}</Badge>
            <form action={updateHandoverChecklistAction} className={styles.checklistForm}>
              <input type="hidden" name="clubId" value={selectedClub.clubId} /><input type="hidden" name="yearId" value={selectedYear.id} /><input type="hidden" name="checklistId" value={entry.id} />
              <Field label="連結文件"><Select name="archiveItemId" defaultValue={entry.archiveItemId ?? ""}><option value="">尚未連結</option>{page.items.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></Field>
              <Field label="狀態"><Select name="status" defaultValue={entry.status}>{(Object.keys(checklistLabels) as ChecklistStatus[]).map((status) => <option key={status} value={status}>{checklistLabels[status]}</option>)}</Select></Field>
              <Field label="備註"><Input name="notes" maxLength={1000} defaultValue={entry.notes ?? ""} /></Field>
              <Button type="submit">儲存項目</Button>
            </form>
          </Card>)}</div>

          <Card>
            <h3>具名交接確認</h3>
            <div className={styles.confirmations}>{page.confirmations.length === 0 ? <p>尚無確認紀錄。</p> : page.confirmations.map((confirmation) => <div key={confirmation.id}><Badge tone="success">{confirmation.confirmationRole === "outgoing" ? "卸任幹部" : "新任幹部"}</Badge><strong>{confirmation.confirmedBy}</strong><span>{new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short" }).format(new Date(confirmation.confirmedAt))}</span></div>)}</div>
            <div className={styles.confirmButtons}>
              <form action={confirmArchiveHandoverAction}><input type="hidden" name="clubId" value={selectedClub.clubId} /><input type="hidden" name="yearId" value={selectedYear.id} /><input type="hidden" name="confirmationRole" value="outgoing" /><Button type="submit" className="button-secondary">我是卸任幹部，確認已交付</Button></form>
              <form action={confirmArchiveHandoverAction}><input type="hidden" name="clubId" value={selectedClub.clubId} /><input type="hidden" name="yearId" value={selectedYear.id} /><input type="hidden" name="confirmationRole" value="incoming" /><Button type="submit">我是新任幹部，確認已收到</Button></form>
            </div>
          </Card>
        </section>}
      </>}
    </>}
  </div>;
}

function ArchiveHeader() {
  return <header className="page-header"><div><p className="eyebrow">社務傳承</p><h1>文件中心與年度交接</h1><p>依扶輪年度保存文件版本，讓新舊幹部知道資料是否完整、是否已收到。</p></div><Link className="button button-secondary" href="/features">返回功能總覽</Link></header>;
}

function ArchiveItemForm({ clubId, yearId, item }: { clubId: string; yearId: string; item?: { id: string; category: ArchiveCategory; title: string; description: string | null; folderPath: string; tags: readonly string[]; confidentiality: "club_internal" | "officers_only" } }) {
  return <form action={item ? updateArchiveItemAction : createArchiveItemAction} className="form-grid">
    <input type="hidden" name="clubId" value={clubId} /><input type="hidden" name="yearId" value={yearId} />{item && <input type="hidden" name="itemId" value={item.id} />}
    <Field label="分類"><Select name="category" defaultValue={item?.category ?? "meeting_minutes"}>{archiveCategories.map((category) => <option key={category} value={category}>{archiveCategoryLabels[category]}</option>)}</Select></Field>
    <Field label="標題"><Input name="title" required maxLength={180} defaultValue={item?.title ?? ""} /></Field>
    <Field label="資料夾"><Input name="folderPath" required maxLength={240} defaultValue={item?.folderPath ?? "未分類"} /></Field>
    <Field label="標籤" hint="用逗號分隔，最多 10 個"><Input name="tags" maxLength={500} defaultValue={item?.tags.join(", ") ?? ""} /></Field>
    <Field label="保密級別"><Select name="confidentiality" defaultValue={item?.confidentiality ?? "club_internal"}><option value="club_internal">社內社員可查看</option><option value="officers_only">僅幹部可查看</option></Select></Field>
    <Field label="說明"><textarea className="input" name="description" rows={4} maxLength={2000} defaultValue={item?.description ?? ""} /></Field>
    <Button type="submit">{item ? "儲存文件說明" : "建立文件項目"}</Button>
  </form>;
}

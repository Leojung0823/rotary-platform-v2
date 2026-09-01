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
import {
  archiveCategories,
  archiveCategoryLabels,
  rotaryYearLabel,
  type ArchivePageProjection,
  type ChecklistStatus,
  type HandoverStatus,
} from "@/lib/archive/contracts";
import styles from "@/app/(authenticated)/archives/archives.module.css";

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

export function ArchiveManagementPanel({
  page,
  selectedClub,
  selectedYear,
}: {
  page: ArchivePageProjection;
  selectedClub: NonNullable<ArchivePageProjection["clubs"][number]>;
  selectedYear: ArchivePageProjection["years"][number] | null;
}) {
  return <div className="page-stack" data-testid="archive-management">
    <section>
      <div className="section-heading"><div><p className="eyebrow">{selectedClub.clubCode}</p><h2>扶輪年度</h2></div><Badge tone="neutral">幹部管理</Badge></div>
      {page.years.length > 0 && <nav className="tabs" aria-label="扶輪年度">
        {page.years.map((year) => <Link key={year.id} href={`/clubs/${encodeURIComponent(selectedClub.clubId)}/archives?yearId=${encodeURIComponent(year.id)}&mode=management`} aria-current={year.id === page.selectedYearId ? "page" : undefined}>{rotaryYearLabel(year.startYear)}</Link>)}
      </nav>}
      <details className={styles.managerPanel} open={page.years.length === 0}>
        <summary>＋ 建立扶輪年度</summary>
        <form action={createRotaryYearAction} className="form-grid">
          <input type="hidden" name="clubId" value={selectedClub.clubId} />
          <Field label="起始年份" hint="例如 2026 代表 2026/7/1–2027/6/30"><Input name="startYear" type="number" min={2000} max={2200} required /></Field>
          <Field label="年度主題"><Input name="theme" maxLength={160} /></Field>
          <Field label="社長"><Input name="presidentName" maxLength={160} /></Field>
          <Field label="秘書"><Input name="secretaryName" maxLength={160} /></Field>
          <Button type="submit">建立年度與清單</Button>
        </form>
      </details>
    </section>

    {!selectedYear ? <EmptyState title="尚未建立扶輪年度" body="建立年度後，才能整理文件版本與交接清單。" /> : <>
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
        <details className={styles.fullWidth}>
          <summary>修改年度資料</summary>
          <form action={updateRotaryYearAction} className="form-grid">
            <input type="hidden" name="clubId" value={selectedClub.clubId} /><input type="hidden" name="yearId" value={selectedYear.id} />
            <Field label="年度主題"><Input name="theme" maxLength={160} defaultValue={selectedYear.theme ?? ""} /></Field>
            <Field label="社長"><Input name="presidentName" maxLength={160} defaultValue={selectedYear.presidentName ?? ""} /></Field>
            <Field label="秘書"><Input name="secretaryName" maxLength={160} defaultValue={selectedYear.secretaryName ?? ""} /></Field>
            <Button type="submit">儲存年度資料</Button>
          </form>
        </details>
      </Card>

      {page.missingRequiredCategories.length > 0 && <Notice tone="error">
        文件斷層提醒：尚缺 {page.missingRequiredCategories.map((item) => archiveCategoryLabels[item]).join("、")} 的可下載版本。
      </Notice>}

      <section>
        <div className="section-heading"><div><p className="eyebrow">文件管理</p><h2>年度文件</h2></div><span>{page.items.length} 個項目</span></div>
        <details className={styles.managerPanel} open>
          <summary>＋ 建立文件項目</summary>
          <ArchiveItemForm clubId={selectedClub.clubId} yearId={selectedYear.id} />
        </details>

        {page.items.length === 0 ? <EmptyState title="尚未建立文件" body="先建立文件項目，再上傳第一個版本。" /> : <div className={styles.documentList}>
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
            <div className={styles.managementGrid}>
              <details><summary>上傳新版本</summary><ArchiveUploadForm clubId={selectedClub.clubId} yearId={selectedYear.id} itemId={item.id} /></details>
              <details><summary>修改文件說明</summary><ArchiveItemForm clubId={selectedClub.clubId} yearId={selectedYear.id} item={item} /></details>
              <form action={archiveArchiveItemAction}><input type="hidden" name="clubId" value={selectedClub.clubId} /><input type="hidden" name="yearId" value={selectedYear.id} /><input type="hidden" name="itemId" value={item.id} /><Button type="submit" className="button-danger">封存項目</Button></form>
            </div>
          </Card>)}
        </div>}
      </section>

      <section>
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
      </section>
    </>}
  </div>;
}

function ArchiveItemForm({
  clubId,
  yearId,
  item,
}: {
  clubId: string;
  yearId: string;
  item?: ArchivePageProjection["items"][number];
}) {
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

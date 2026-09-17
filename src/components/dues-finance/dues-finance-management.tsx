"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Field, Input, Notice, Select } from "@/components/ui";
import type {
  DuesFinanceAnnualDefault,
  DuesFinanceManagementLedger,
  DuesFinancePaymentMethod,
} from "@/lib/dues-finance/contracts";
import { APP_TIME_ZONE } from "@/lib/time";
import styles from "./dues-finance-management.module.css";

type MemberOption = Readonly<{ membershipId: string; displayName: string }>;
type ManagementPermissions = Readonly<{ canManage: boolean; canApprove: boolean }>;

const moneyFormatter = new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("zh-TW", { timeZone: APP_TIME_ZONE, dateStyle: "medium" });
const paymentMethodLabels: Record<DuesFinancePaymentMethod, string> = {
  cash: "現金",
  bank_transfer: "轉帳",
  check: "支票",
  other: "其他",
};
const receivableStatusLabels = { unpaid: "未收", partial: "部分收款", paid: "已收清" } as const;

type RosterFilter = "unpaid" | "partial" | "paid" | "all";

function matchesRosterFilter(status: keyof typeof receivableStatusLabels, filter: RosterFilter) {
  return filter === "all" || status === filter;
}
const advanceStatusLabels = { submitted: "待審核", returned: "已退回", closed: "已結案" } as const;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function newIdempotencyKey(prefix: string) {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}

class DuesFinanceRequestError extends Error {
  constructor(readonly status: number) {
    super("dues_finance_request_failed");
  }
}

async function postMutation(body: Record<string, unknown>) {
  const response = await fetch("/api/v1/dues-finance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new DuesFinanceRequestError(response.status);
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00Z`));
}

function errorMessage(error: unknown) {
  if (error instanceof DuesFinanceRequestError && error.status === 403) return "您沒有執行這項財務操作的權限。";
  if (error instanceof DuesFinanceRequestError && error.status === 409) return "資料剛被更新過，請重新整理後再試。";
  if (error instanceof DuesFinanceRequestError && error.status === 404) return "這項功能目前沒有開啟，或找不到指定的資料。";
  return "操作沒有完成，請確認輸入後再試。";
}

function ActionForm({
  children,
  onSubmit,
  className = "",
}: {
  children: React.ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  className?: string;
}) {
  return <form className={`${styles.actionForm} ${className}`} onSubmit={onSubmit}>{children}</form>;
}

export function DuesFinanceManagement({
  initialLedger,
  annualDefault,
  members,
  permissions,
}: {
  initialLedger: DuesFinanceManagementLedger;
  annualDefault: DuesFinanceAnnualDefault | null;
  members: readonly MemberOption[];
  permissions: ManagementPermissions;
}) {
  const router = useRouter();
  const ledger = initialLedger;
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [pending, setPending] = useState<string | null>(null);
  const [defaultAmount, setDefaultAmount] = useState(String(annualDefault?.defaultAmount ?? ""));
  const [defaultReason, setDefaultReason] = useState("");
  const [generateNote, setGenerateNote] = useState("");
  const [receivableMember, setReceivableMember] = useState(members[0]?.membershipId ?? "");
  const [receivableAmount, setReceivableAmount] = useState("");
  const [receivableSourceKind, setReceivableSourceKind] = useState<"manual" | "opening_balance">("manual");
  const [receivableNote, setReceivableNote] = useState("");
  const [receiptAmounts, setReceiptAmounts] = useState<Record<string, string>>({});
  const [receivedOn, setReceivedOn] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState<DuesFinancePaymentMethod>("cash");
  const [referenceNote, setReferenceNote] = useState("");
  const [advanceMember, setAdvanceMember] = useState(members[0]?.membershipId ?? "");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceDescription, setAdvanceDescription] = useState("");
  const [advanceIncurredOn, setAdvanceIncurredOn] = useState(today);
  const [rosterQuery, setRosterQuery] = useState("");
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>("unpaid");
  const [batchMode, setBatchMode] = useState(false);
  const [openReceipt, setOpenReceipt] = useState<string | null>(null);
  const [rowAmount, setRowAmount] = useState("");

  const unpaidCount = useMemo(
    () => ledger.receivables.filter((entry) => entry.outstandingAmount > 0).length,
    [ledger.receivables],
  );

  /** 未繳的排前面：財務打開這一頁，要找的幾乎一定是還沒收到的那些。 */
  const visibleReceivables = useMemo(() => {
    const needle = rosterQuery.trim().toLocaleLowerCase();
    return ledger.receivables
      .filter((entry) => matchesRosterFilter(entry.status, rosterFilter))
      .filter((entry) => needle === "" || entry.memberDisplayName.toLocaleLowerCase().includes(needle))
      .slice()
      .sort((left, right) => {
        if ((left.outstandingAmount > 0) !== (right.outstandingAmount > 0)) {
          return left.outstandingAmount > 0 ? -1 : 1;
        }
        return left.memberDisplayName.localeCompare(right.memberDisplayName, "zh-Hant");
      });
  }, [ledger.receivables, rosterFilter, rosterQuery]);

  const rosterFilters = useMemo(() => ([
    { key: "unpaid" as const, label: "未繳", count: ledger.receivables.filter((entry) => entry.status === "unpaid").length },
    { key: "partial" as const, label: "部分", count: ledger.receivables.filter((entry) => entry.status === "partial").length },
    { key: "paid" as const, label: "已收清", count: ledger.receivables.filter((entry) => entry.status === "paid").length },
    { key: "all" as const, label: "全部", count: ledger.receivables.length },
  ]), [ledger.receivables]);

  const receiptTotal = useMemo(() => Object.values(receiptAmounts).reduce((total, amount) => total + (Number(amount) || 0), 0), [receiptAmounts]);

  async function runAction(action: string, body: Record<string, unknown>, success: string, reset?: () => void) {
    setPending(action);
    setMessage(null);
    try {
      await postMutation(body);
      reset?.();
      setMessageTone("success");
      setMessage(success);
      router.refresh();
    } catch (error) {
      setMessageTone("error");
      setMessage(errorMessage(error));
    } finally {
      setPending(null);
    }
  }

  function submitAnnualDefault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAction("annual-default", {
      action: "set_annual_default",
      clubId: ledger.clubId,
      rotaryYearId: ledger.rotaryYearId,
      defaultAmount: Number(defaultAmount),
      reason: defaultReason.trim() || null,
    }, "年度預設金額已儲存。", () => setDefaultReason(""));
  }

  function generateReceivables(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAction("generate-receivables", {
      action: "generate_receivables",
      clubId: ledger.clubId,
      rotaryYearId: ledger.rotaryYearId,
      sourceNote: generateNote.trim() || null,
    }, "已為尚未建立應收的社員產生年度應收。", () => setGenerateNote(""));
  }

  function createReceivable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAction("create-receivable", {
      action: "create_receivable",
      clubId: ledger.clubId,
      rotaryYearId: ledger.rotaryYearId,
      membershipId: receivableMember,
      amount: Number(receivableAmount),
      sourceNote: receivableNote,
      sourceKind: receivableSourceKind,
      idempotencyKey: newIdempotencyKey("receivable"),
    }, "應收項目已建立。", () => {
      setReceivableAmount("");
      setReceivableNote("");
    });
  }

  function adjustReceivable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const receivableId = String(form.get("receivableId") ?? "");
    void runAction(`adjust-${receivableId}`, {
      action: "adjust_receivable",
      clubId: ledger.clubId,
      receivableId,
      amountDelta: Number(form.get("amountDelta")),
      reason: String(form.get("reason") ?? ""),
      idempotencyKey: newIdempotencyKey("adjustment"),
    }, "應收金額已調整。", () => event.currentTarget.reset());
  }

  /** 展開某一列的收款，金額預填未收額 —— 全額繳清不必打任何字。 */
  function openRowReceipt(receivableId: string, outstanding: number) {
    setOpenReceipt((current) => (current === receivableId ? null : receivableId));
    setRowAmount(String(outstanding));
  }

  function submitRowReceipt(event: FormEvent<HTMLFormElement>, receivableId: string) {
    event.preventDefault();
    const amount = Number(rowAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessageTone("error");
      setMessage("請填寫本次收到的金額。");
      return;
    }
    // 同一支 record_dues_receipt，只是分配陣列長度為 1。收款仍然當場全額分配，
    // 財務紀錄的不變量一行都沒有鬆動。
    void runAction(`row-receipt-${receivableId}`, {
      action: "record_receipt",
      clubId: ledger.clubId,
      receivedOn,
      paymentMethod,
      referenceNote: referenceNote.trim() || null,
      allocations: [{ receivableId, amount }],
      idempotencyKey: newIdempotencyKey("receipt"),
    }, "收款已登錄。", () => {
      setOpenReceipt(null);
      setRowAmount("");
      setReferenceNote("");
    });
  }

  function recordReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const allocations = ledger.receivables.flatMap((receivable) => {
      const raw = receiptAmounts[receivable.receivableId]?.trim() ?? "";
      return raw === "" ? [] : [{ receivableId: receivable.receivableId, amount: Number(raw) }];
    });
    if (allocations.length === 0) {
      setMessageTone("error");
      setMessage("請至少填一筆本次收到的金額。");
      return;
    }
    void runAction("record-receipt", {
      action: "record_receipt",
      clubId: ledger.clubId,
      receivedOn,
      paymentMethod,
      referenceNote: referenceNote.trim() || null,
      allocations,
      idempotencyKey: newIdempotencyKey("receipt"),
    }, "收款已登錄。", () => {
      setReceiptAmounts({});
      setReferenceNote("");
    });
  }

  function reverseReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const receiptId = String(form.get("receiptId") ?? "");
    void runAction(`reverse-receipt-${receiptId}`, {
      action: "reverse_receipt",
      clubId: ledger.clubId,
      receiptId,
      reason: String(form.get("reason") ?? ""),
    }, "收款已沖銷，原紀錄仍保留。", () => event.currentTarget.reset());
  }

  function submitAdvance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAction("submit-advance", {
      action: "submit_advance",
      clubId: ledger.clubId,
      rotaryYearId: ledger.rotaryYearId,
      payerMembershipId: advanceMember,
      amount: Number(advanceAmount),
      description: advanceDescription,
      incurredOn: advanceIncurredOn,
      idempotencyKey: newIdempotencyKey("advance"),
    }, "代墊申請已建立。", () => {
      setAdvanceAmount("");
      setAdvanceDescription("");
    });
  }

  function returnAdvance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const advanceId = String(form.get("advanceId") ?? "");
    void runAction(`return-advance-${advanceId}`, {
      action: "return_advance",
      clubId: ledger.clubId,
      advanceId,
      reason: String(form.get("reason") ?? ""),
    }, "代墊已退回，社員可修改後重新送出。", () => event.currentTarget.reset());
  }

  function resubmitAdvance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const advanceId = String(form.get("advanceId") ?? "");
    void runAction(`resubmit-advance-${advanceId}`, {
      action: "resubmit_advance",
      clubId: ledger.clubId,
      advanceId,
      note: String(form.get("note") ?? "").trim() || null,
    }, "代墊已重新送出。", () => event.currentTarget.reset());
  }

  function approveReconciliation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const advanceId = String(form.get("advanceId") ?? "");
    void runAction(`approve-advance-${advanceId}`, {
      action: "approve_reconciliation",
      clubId: ledger.clubId,
      advanceId,
      amount: Number(form.get("amount")),
      approvalNote: String(form.get("approvalNote") ?? "").trim() || null,
      idempotencyKey: newIdempotencyKey("reconciliation"),
    }, "核銷已登錄。", () => event.currentTarget.reset());
  }

  function reverseReconciliation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const reconciliationId = String(form.get("reconciliationId") ?? "");
    void runAction(`reverse-reconciliation-${reconciliationId}`, {
      action: "reverse_reconciliation",
      clubId: ledger.clubId,
      reconciliationId,
      reason: String(form.get("reason") ?? ""),
    }, "核銷已反向調整，原紀錄仍保留。", () => event.currentTarget.reset());
  }

  return <div className={styles.management}>
    <section className={styles.metrics} aria-label="社費年度摘要">
      <div className={styles.metric}><span>應收總額</span><strong>{moneyFormatter.format(ledger.summary.receivableAmount)}</strong><small>{ledger.receivables.length} 筆</small></div>
      <div className={styles.metric}><span>已收總額</span><strong>{moneyFormatter.format(ledger.summary.receivedAmount)}</strong><small>尚未收 {moneyFormatter.format(ledger.summary.outstandingAmount)}</small></div>
      <div className={styles.metric}><span>代墊總額</span><strong>{moneyFormatter.format(ledger.summary.advanceAmount)}</strong><small>待核銷 {moneyFormatter.format(ledger.summary.advanceOutstandingAmount)}</small></div>
      <div className={styles.metric}><span>已核銷</span><strong>{moneyFormatter.format(ledger.summary.reconciledAmount)}</strong><small>{ledger.advances.length} 筆代墊</small></div>
    </section>

    {message && <Notice tone={messageTone}>{message}</Notice>}

    {/* 年度設定是一年用一次的事，摺疊起來。它原本永遠佔著整頁最上面，
        而財務每天要做的收款排在它後面第四個區塊。 */}
    {permissions.canManage && <details className={styles.yearSetup}>
      <summary>年度設定 · 應收預設與個別應收</summary>
      <div className={styles.yearSetupBody}>
        <Card>
          <div className="section-heading"><div><p className="eyebrow">年度設定</p><h2>應收預設</h2></div><Badge tone={annualDefault ? "success" : "warning"}>{annualDefault ? `目前 ${moneyFormatter.format(annualDefault.defaultAmount)}` : "尚未設定"}</Badge></div>
          <ActionForm onSubmit={submitAnnualDefault}>
            <div className={styles.formGrid}><Field label="每位社員的年度社費"><Input type="number" min="1" step="1" value={defaultAmount} onChange={(event) => setDefaultAmount(event.target.value)} required disabled={pending !== null} /></Field><Field label="調整原因（選填）"><Input value={defaultReason} onChange={(event) => setDefaultReason(event.target.value)} maxLength={500} disabled={pending !== null} /></Field></div>
            <Button type="submit" disabled={pending !== null}>儲存預設金額</Button>
          </ActionForm>
          <ActionForm onSubmit={generateReceivables}>
            <Field label="產生年度應收的備註（選填）"><Input value={generateNote} onChange={(event) => setGenerateNote(event.target.value)} maxLength={500} placeholder="例如：2026-27 年度社費" disabled={pending !== null} /></Field>
            <p className={styles.formHint}>只為尚未建立應收的有效社員產生，重複執行不會重覆計費。</p>
            <Button type="submit" className="button-secondary" disabled={pending !== null || !annualDefault}>產生年度應收</Button>
          </ActionForm>
        </Card>

        <Card>
          <div className="section-heading"><div><p className="eyebrow">期初或個別調整</p><h2>新增一筆應收</h2></div></div>
          <ActionForm onSubmit={createReceivable}>
            <div className={styles.formGrid}><Field label="社員"><Select value={receivableMember} onChange={(event) => setReceivableMember(event.target.value)} disabled={pending !== null}>{members.map((member) => <option key={member.membershipId} value={member.membershipId}>{member.displayName}</option>)}</Select></Field><Field label="金額"><Input type="number" min="1" step="1" value={receivableAmount} onChange={(event) => setReceivableAmount(event.target.value)} required disabled={pending !== null} /></Field><Field label="來源"><Select value={receivableSourceKind} onChange={(event) => setReceivableSourceKind(event.target.value as "manual" | "opening_balance")} disabled={pending !== null}><option value="manual">個別建立</option><option value="opening_balance">期初餘額</option></Select></Field><Field label="說明"><Input value={receivableNote} onChange={(event) => setReceivableNote(event.target.value)} maxLength={500} required disabled={pending !== null} /></Field></div>
            <Button type="submit" className="button-secondary" disabled={pending !== null || members.length === 0}>建立應收</Button>
          </ActionForm>
        </Card>
      </div>
    </details>}

    {/* 一份名單，一列一個人。原本是兩份：第三段把每個人畫成一張卡片（用來看），
        第四段再把同一批人畫成一個輸入框（用來動手）。看和做在不同地方。 */}
    <section aria-labelledby="dues-receivables-heading">
      <div className="section-heading">
        <div><p className="eyebrow">社員社費</p><h2 id="dues-receivables-heading">收款名單</h2></div>
        <span>{unpaidCount > 0 ? `還有 ${unpaidCount} 位未收清` : "全部收齊"}</span>
      </div>

      {ledger.receivables.length === 0 ? <Card><p>本年度尚未建立應收資料。可以先在「年度設定」設好預設金額，再產生年度應收。</p></Card> : <Card className={styles.roster}>
        <div className={styles.rosterTools}>
          <Input
            aria-label="搜尋社員"
            value={rosterQuery}
            onChange={(event) => setRosterQuery(event.target.value)}
            placeholder="搜尋社員姓名"
            className={styles.rosterSearch}
          />
          <div className={styles.filterChips} role="group" aria-label="篩選社費狀態">
            {rosterFilters.map((filter) => <button
              key={filter.key}
              type="button"
              className={`${styles.chip} ${rosterFilter === filter.key ? styles.chipOn : ""}`}
              aria-pressed={rosterFilter === filter.key}
              onClick={() => setRosterFilter(filter.key)}
            >{filter.label} {filter.count}</button>)}
          </div>
          {permissions.canManage && <label className={styles.batchToggle}>
            <input type="checkbox" checked={batchMode} onChange={(event) => { setBatchMode(event.target.checked); setOpenReceipt(null); }} />
            <span>一次收多筆</span>
          </label>}
        </div>

        {/* 批次是同一份名單的另一種操作方式，不是另一份名單。對整批匯入時它是對的
            工具，但那一年發生幾次；實際發生的是一個人、一筆錢。 */}
        {batchMode && permissions.canManage ? <ActionForm onSubmit={recordReceipt} className={styles.batchForm}>
          <div className={styles.formGrid}>
            <Field label="收款日期"><Input type="date" value={receivedOn} onChange={(event) => setReceivedOn(event.target.value)} required disabled={pending !== null} /></Field>
            <Field label="收款方式"><Select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as DuesFinancePaymentMethod)} disabled={pending !== null}>{Object.entries(paymentMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
            <Field label="核對備註（選填）"><Input value={referenceNote} onChange={(event) => setReferenceNote(event.target.value)} maxLength={500} placeholder="例如：轉帳末五碼" disabled={pending !== null} /></Field>
          </div>
          <div className={styles.receiptList}>{visibleReceivables.filter((entry) => entry.outstandingAmount > 0).map((receivable) => <label className={styles.receiptRow} key={receivable.receivableId}>
            <span><strong>{receivable.memberDisplayName}</strong><small>未收 {moneyFormatter.format(receivable.outstandingAmount)}</small></span>
            <Input type="number" min="1" max={String(receivable.outstandingAmount)} step="1" value={receiptAmounts[receivable.receivableId] ?? ""} onChange={(event) => setReceiptAmounts((current) => ({ ...current, [receivable.receivableId]: event.target.value }))} placeholder="本次收款" disabled={pending !== null} />
          </label>)}</div>
          <Button type="submit" disabled={pending !== null || receiptTotal <= 0}>登錄收款 · 合計 {moneyFormatter.format(receiptTotal)}</Button>
        </ActionForm> : <ul className={styles.rosterList}>
          {visibleReceivables.length === 0 ? <li className={styles.rosterEmpty}>沒有符合的社員。</li> : visibleReceivables.map((receivable) => <li className={styles.rosterItem} key={receivable.receivableId}>
            <div className={styles.rosterRow}>
              <strong className={styles.rosterName}>{receivable.memberDisplayName}</strong>
              <span className={styles.rosterFigures}>
                應收 {moneyFormatter.format(receivable.receivableAmount)}
                {receivable.receivedAmount > 0 && receivable.outstandingAmount > 0 && ` · 已收 ${moneyFormatter.format(receivable.receivedAmount)}`}
                {receivable.outstandingAmount > 0 && ` · 未收 ${moneyFormatter.format(receivable.outstandingAmount)}`}
              </span>
              {receivable.outstandingAmount === 0
                ? <Badge tone="success">已收清</Badge>
                : permissions.canManage
                  ? <Button
                      type="button"
                      className="button-secondary"
                      disabled={pending !== null}
                      aria-expanded={openReceipt === receivable.receivableId}
                      onClick={() => openRowReceipt(receivable.receivableId, receivable.outstandingAmount)}
                    >收款</Button>
                  : <Badge tone={receivable.status === "partial" ? "warning" : "neutral"}>{receivableStatusLabels[receivable.status]}</Badge>}
            </div>

            {/* 金額預填未收額、日期預設今天、收款方式沿用上次 —— 全額繳清是最常見的
                情況，而它現在是點兩下、零打字。 */}
            {openReceipt === receivable.receivableId && <ActionForm className={styles.rowReceipt} onSubmit={(event) => submitRowReceipt(event, receivable.receivableId)}>
              <div className={styles.formGrid}>
                <Field label="本次收款"><Input type="number" min="1" max={String(receivable.outstandingAmount)} step="1" value={rowAmount} onChange={(event) => setRowAmount(event.target.value)} required autoFocus disabled={pending !== null} /></Field>
                <Field label="收款日期"><Input type="date" value={receivedOn} onChange={(event) => setReceivedOn(event.target.value)} required disabled={pending !== null} /></Field>
                <Field label="收款方式"><Select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as DuesFinancePaymentMethod)} disabled={pending !== null}>{Object.entries(paymentMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
                <Field label="核對備註（選填）"><Input value={referenceNote} onChange={(event) => setReferenceNote(event.target.value)} maxLength={500} placeholder="例如：轉帳末五碼" disabled={pending !== null} /></Field>
              </div>
              <div className={styles.rowReceiptActions}>
                <Button type="submit" disabled={pending !== null}>確認收款</Button>
                <Button type="button" className="button-secondary" disabled={pending !== null} onClick={() => setOpenReceipt(null)}>取消</Button>
              </div>
            </ActionForm>}

            {permissions.canManage && receivable.status !== "paid" && <details className={styles.rowDetails}>
              <summary>調整應收金額</summary>
              <ActionForm onSubmit={adjustReceivable}>
                <input type="hidden" name="receivableId" value={receivable.receivableId} />
                <Field label="調整金額"><Input name="amountDelta" type="number" step="1" min={String(-receivable.receivableAmount + receivable.receivedAmount)} required placeholder="可填負數" disabled={pending !== null} /></Field>
                <Field label="原因"><Input name="reason" minLength={2} maxLength={500} required placeholder="例如：減免一部分社費" disabled={pending !== null} /></Field>
                <Button type="submit" className="button-secondary" disabled={pending !== null}>儲存調整</Button>
              </ActionForm>
            </details>}
          </li>)}
        </ul>}
      </Card>}
    </section>

    <section aria-labelledby="dues-receipt-history-heading">
      <div className="section-heading"><div><p className="eyebrow">收款紀錄</p><h2 id="dues-receipt-history-heading">已登錄收款</h2></div><span>{ledger.receipts.length} 筆</span></div>
      {ledger.receipts.length === 0 ? <Card><p>尚未有收款紀錄。</p></Card> : <div className={styles.recordList}>{ledger.receipts.map((receipt) => <Card key={receipt.receiptId} className={styles.recordCard}>
        <div className={styles.recordHeading}><div><h3>{moneyFormatter.format(receipt.amount)} · {paymentMethodLabels[receipt.paymentMethod]}</h3><small>{formatDate(receipt.receivedOn)}{receipt.referenceNote ? ` · ${receipt.referenceNote}` : ""}</small></div><Badge tone={receipt.status === "posted" ? "success" : "warning"}>{receipt.status === "posted" ? "有效" : "已沖銷"}</Badge></div>
        <p>{receipt.allocations.map((allocation) => `${allocation.memberDisplayName ?? "社員"} ${moneyFormatter.format(allocation.amount)}`).join("、")}</p>
        {permissions.canManage && receipt.status === "posted" && <details className={styles.details}><summary>沖銷這筆收款</summary><ActionForm onSubmit={reverseReceipt}><input type="hidden" name="receiptId" value={receipt.receiptId} /><Field label="沖銷原因"><Input name="reason" minLength={2} maxLength={500} required placeholder="例如：轉帳金額填錯" disabled={pending !== null} /></Field><Button type="submit" className="button-danger" disabled={pending !== null}>保留紀錄並沖銷</Button></ActionForm></details>}
      </Card>)}</div>}
    </section>

    {permissions.canManage && <Card>
      <div className="section-heading"><div><p className="eyebrow">社員代墊</p><h2>新增代墊申請</h2></div></div>
      <ActionForm onSubmit={submitAdvance} className={styles.formGrid}>
        <Field label="代墊社員"><Select value={advanceMember || members[0]?.membershipId || ""} onChange={(event) => setAdvanceMember(event.target.value)} required disabled={pending !== null || members.length === 0}><option value="">請選擇社員</option>{members.map((member) => <option key={member.membershipId} value={member.membershipId}>{member.displayName}</option>)}</Select></Field>
        <Field label="金額"><Input type="number" min="1" step="1" value={advanceAmount} onChange={(event) => setAdvanceAmount(event.target.value)} required disabled={pending !== null} /></Field>
        <Field label="支出日期"><Input type="date" value={advanceIncurredOn} onChange={(event) => setAdvanceIncurredOn(event.target.value)} required disabled={pending !== null} /></Field>
        <Field label="支出說明"><Input value={advanceDescription} onChange={(event) => setAdvanceDescription(event.target.value)} minLength={2} maxLength={1000} required placeholder="例如：活動場地訂金" disabled={pending !== null} /></Field>
        <Button type="submit" disabled={pending !== null || members.length === 0}>送出代墊</Button>
      </ActionForm>
    </Card>}

    <section aria-labelledby="dues-advances-heading">
      <div className="section-heading"><div><p className="eyebrow">代墊與核銷</p><h2 id="dues-advances-heading">代墊清單</h2></div><span>{ledger.advances.length} 筆</span></div>
      {ledger.advances.length === 0 ? <Card><p>尚未有代墊申請。</p></Card> : <div className={styles.recordList}>{ledger.advances.map((advance) => <Card key={advance.advanceId} className={styles.recordCard}>
        <div className={styles.recordHeading}><div><h3>{advance.payerDisplayName} · {moneyFormatter.format(advance.amount)}</h3><small>{formatDate(advance.incurredOn)} · {advance.description}</small></div><Badge tone={advance.advanceStatus === "closed" ? "success" : advance.advanceStatus === "returned" ? "danger" : "warning"}>{advanceStatusLabels[advance.advanceStatus]}</Badge></div>
        <dl className={styles.amountList}><div><dt>已核銷</dt><dd>{moneyFormatter.format(advance.reconciledAmount)}</dd></div><div><dt>待核銷</dt><dd>{moneyFormatter.format(advance.outstandingAmount)}</dd></div><div><dt>送件次數</dt><dd>{advance.submissionCount}</dd></div></dl>
        {permissions.canApprove && advance.advanceStatus === "submitted" && advance.outstandingAmount > 0 && <details className={styles.details} open><summary>核准核銷</summary><ActionForm onSubmit={approveReconciliation}><input type="hidden" name="advanceId" value={advance.advanceId} /><Field label="本次核銷金額"><Input name="amount" type="number" min="1" max={String(advance.outstandingAmount)} step="1" defaultValue={advance.outstandingAmount} required disabled={pending !== null} /></Field><Field label="核准備註（選填）"><Input name="approvalNote" maxLength={500} placeholder="例如：已核對發票" disabled={pending !== null} /></Field><Button type="submit" disabled={pending !== null}>核准</Button></ActionForm></details>}
        {permissions.canApprove && advance.advanceStatus === "submitted" && <details className={styles.details}><summary>退回申請</summary><ActionForm onSubmit={returnAdvance}><input type="hidden" name="advanceId" value={advance.advanceId} /><Field label="退回原因"><Input name="reason" minLength={2} maxLength={500} required placeholder="例如：請補上收據" disabled={pending !== null} /></Field><Button type="submit" className="button-secondary" disabled={pending !== null}>退回</Button></ActionForm></details>}
        {permissions.canManage && advance.advanceStatus === "returned" && <details className={styles.details}><summary>代為重新送出</summary><ActionForm onSubmit={resubmitAdvance}><input type="hidden" name="advanceId" value={advance.advanceId} /><Field label="補充說明（選填）"><Input name="note" maxLength={500} disabled={pending !== null} /></Field><Button type="submit" className="button-secondary" disabled={pending !== null}>重新送出</Button></ActionForm></details>}
        {advance.reconciliations.length > 0 && <div className={styles.reconciliationList}><strong>核銷歷程</strong>{advance.reconciliations.map((reconciliation) => <div className={styles.reconciliationRow} key={reconciliation.reconciliationId}><span>{moneyFormatter.format(reconciliation.amount)} · {formatDate(reconciliation.approvedAt.slice(0, 10))}{reconciliation.approvalNote ? ` · ${reconciliation.approvalNote}` : ""}</span><Badge tone={reconciliation.status === "posted" ? "success" : "warning"}>{reconciliation.status === "posted" ? "有效" : "已反向"}</Badge>{permissions.canApprove && reconciliation.status === "posted" && <details className={styles.inlineDetails}><summary>反向</summary><ActionForm onSubmit={reverseReconciliation}><input type="hidden" name="reconciliationId" value={reconciliation.reconciliationId} /><Input name="reason" minLength={2} maxLength={500} required placeholder="反向原因" disabled={pending !== null} /><Button type="submit" className="button-danger" disabled={pending !== null}>確認</Button></ActionForm></details>}{reconciliation.reversalReason && <small>{reconciliation.reversalReason}</small>}</div>)}</div>}
      </Card>)}</div>}
    </section>
  </div>;
}

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

    <Card>
      <div className="section-heading"><div><p className="eyebrow">年度設定</p><h2>應收預設</h2></div><Badge tone={annualDefault ? "success" : "warning"}>{annualDefault ? `目前 ${moneyFormatter.format(annualDefault.defaultAmount)}` : "尚未設定"}</Badge></div>
      <p>先設定本年度每位社員的預設應收，再按按鈕產生尚未建立的應收。已存在的個別金額不會被覆蓋。</p>
      {permissions.canManage ? <div className={styles.formGrid}>
        <ActionForm onSubmit={submitAnnualDefault}>
          <Field label="年度預設金額"><Input type="number" min="1" step="1" value={defaultAmount} onChange={(event) => setDefaultAmount(event.target.value)} required disabled={pending !== null} /></Field>
          <Field label="調整原因（選填）"><Input value={defaultReason} onChange={(event) => setDefaultReason(event.target.value)} maxLength={500} placeholder="例如：本年度社費決議" disabled={pending !== null} /></Field>
          <Button type="submit" disabled={pending !== null}>儲存年度預設</Button>
        </ActionForm>
        <ActionForm onSubmit={generateReceivables}>
          <Field label="應收來源說明（選填）"><Input value={generateNote} onChange={(event) => setGenerateNote(event.target.value)} maxLength={500} placeholder="例如：2026-27 年度社費" disabled={pending !== null} /></Field>
          <p className={styles.formHint}>只會建立還沒有應收資料的有效社員。</p>
          <Button type="submit" className="button-secondary" disabled={pending !== null || !annualDefault}>產生年度應收</Button>
        </ActionForm>
      </div> : <Notice>您目前只有查看權限，不能修改年度應收設定。</Notice>}
    </Card>

    {permissions.canManage && <Card>
      <div className="section-heading"><div><p className="eyebrow">期初或個別調整</p><h2>新增一筆應收</h2></div></div>
      <ActionForm onSubmit={createReceivable} className={styles.formGrid}>
        <Field label="社員"><Select value={receivableMember || members[0]?.membershipId || ""} onChange={(event) => setReceivableMember(event.target.value)} required disabled={pending !== null || members.length === 0}><option value="">請選擇社員</option>{members.map((member) => <option key={member.membershipId} value={member.membershipId}>{member.displayName}</option>)}</Select></Field>
        <Field label="金額"><Input type="number" min="1" step="1" value={receivableAmount} onChange={(event) => setReceivableAmount(event.target.value)} required disabled={pending !== null} /></Field>
        <Field label="來源"><Select value={receivableSourceKind} onChange={(event) => setReceivableSourceKind(event.target.value as "manual" | "opening_balance")} disabled={pending !== null}><option value="manual">個別應收</option><option value="opening_balance">期初餘額</option></Select></Field>
        <Field label="說明"><Input value={receivableNote} onChange={(event) => setReceivableNote(event.target.value)} minLength={2} maxLength={500} required placeholder="例如：加入後按比例計算" disabled={pending !== null} /></Field>
        <Button type="submit" disabled={pending !== null || members.length === 0}>建立應收</Button>
      </ActionForm>
    </Card>}

    <section aria-labelledby="dues-receivables-heading">
      <div className="section-heading"><div><p className="eyebrow">社員應收</p><h2 id="dues-receivables-heading">每位社員的社費狀態</h2></div><span>{ledger.receivables.length} 筆</span></div>
      {ledger.receivables.length === 0 ? <Card><p>本年度尚未建立應收資料。可以先設定年度預設，再產生年度應收。</p></Card> : <div className={styles.recordList}>{ledger.receivables.map((receivable) => <Card key={receivable.receivableId} className={styles.recordCard}>
        <div className={styles.recordHeading}><div><h3>{receivable.memberDisplayName}</h3><small>{receivable.sourceKind === "opening_balance" ? "期初餘額" : receivable.sourceKind === "annual_default" ? "年度預設" : "個別建立"} · {receivable.sourceNote}</small></div><Badge tone={receivable.status === "paid" ? "success" : receivable.status === "partial" ? "warning" : "neutral"}>{receivableStatusLabels[receivable.status]}</Badge></div>
        <dl className={styles.amountList}><div><dt>應收</dt><dd>{moneyFormatter.format(receivable.receivableAmount)}</dd></div><div><dt>已收</dt><dd>{moneyFormatter.format(receivable.receivedAmount)}</dd></div><div><dt>未收</dt><dd>{moneyFormatter.format(receivable.outstandingAmount)}</dd></div></dl>
        {permissions.canManage && receivable.status !== "paid" && <details className={styles.details}><summary>新增金額調整</summary><ActionForm onSubmit={adjustReceivable}>
          <input type="hidden" name="receivableId" value={receivable.receivableId} />
          <Field label="調整金額"><Input name="amountDelta" type="number" step="1" min={String(-receivable.receivableAmount + receivable.receivedAmount)} required placeholder="可填負數" disabled={pending !== null} /></Field>
          <Field label="原因"><Input name="reason" minLength={2} maxLength={500} required placeholder="例如：減免一部分社費" disabled={pending !== null} /></Field>
          <Button type="submit" className="button-secondary" disabled={pending !== null}>儲存調整</Button>
        </ActionForm></details>}
      </Card>)}</div>}
    </section>

    {permissions.canManage && <Card>
      <div className="section-heading"><div><p className="eyebrow">收款登錄</p><h2>記錄一筆或多筆收款</h2></div><Badge tone="neutral">合計 {moneyFormatter.format(receiptTotal)}</Badge></div>
      <p>在社員旁邊填入本次收到的金額，可以一次分配給多筆應收；少於未收金額就是部分收款。</p>
      <ActionForm onSubmit={recordReceipt}>
        <div className={styles.formGrid}><Field label="收款日期"><Input type="date" value={receivedOn} onChange={(event) => setReceivedOn(event.target.value)} required disabled={pending !== null} /></Field><Field label="收款方式"><Select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as DuesFinancePaymentMethod)} disabled={pending !== null}>{Object.entries(paymentMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field><Field label="核對備註（選填）"><Input value={referenceNote} onChange={(event) => setReferenceNote(event.target.value)} maxLength={500} placeholder="例如：轉帳末五碼" disabled={pending !== null} /></Field></div>
        <div className={styles.receiptList}>{ledger.receivables.filter((entry) => entry.outstandingAmount > 0).map((receivable) => <label className={styles.receiptRow} key={receivable.receivableId}><span><strong>{receivable.memberDisplayName}</strong><small>未收 {moneyFormatter.format(receivable.outstandingAmount)}</small></span><Input type="number" min="1" max={String(receivable.outstandingAmount)} step="1" value={receiptAmounts[receivable.receivableId] ?? ""} onChange={(event) => setReceiptAmounts((current) => ({ ...current, [receivable.receivableId]: event.target.value }))} placeholder="本次收款" disabled={pending !== null} /></label>)}</div>
        <Button type="submit" disabled={pending !== null || ledger.receivables.every((entry) => entry.outstandingAmount === 0)}>登錄收款</Button>
      </ActionForm>
    </Card>}

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

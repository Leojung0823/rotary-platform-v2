"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Field, Input, Notice } from "@/components/ui";
import type { DuesFinanceMemberLedger } from "@/lib/dues-finance/contracts";
import styles from "./dues-finance-member.module.css";

const moneyFormatter = new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium" });

function today() {
  return new Date().toISOString().slice(0, 10);
}

function idempotencyKey() {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `member-advance-${id}`;
}

class MemberFinanceRequestError extends Error {
  constructor(readonly status: number) {
    super("member_dues_finance_request_failed");
  }
}

async function submitAdvance(body: Record<string, unknown>) {
  const response = await fetch("/api/v1/dues-finance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new MemberFinanceRequestError(response.status);
}

function errorMessage(error: unknown) {
  if (error instanceof MemberFinanceRequestError && error.status === 403) return "您目前不能操作這筆代墊。";
  if (error instanceof MemberFinanceRequestError && error.status === 409) return "資料剛被更新過，請重新整理後再試。";
  return "操作沒有完成，請確認輸入後再試。";
}

export function DuesFinanceMember({ initialLedger }: { initialLedger: DuesFinanceMemberLedger }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [incurredOn, setIncurredOn] = useState(today);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const receivableAmount = initialLedger.receivables.reduce((total, entry) => total + entry.receivableAmount, 0);
  const receivedAmount = initialLedger.receivables.reduce((total, entry) => total + entry.receivedAmount, 0);
  const outstandingAmount = initialLedger.receivables.reduce((total, entry) => total + entry.outstandingAmount, 0);

  async function run(action: string, body: Record<string, unknown>, success: string, reset?: () => void) {
    setPending(action);
    setMessage(null);
    try {
      await submitAdvance(body);
      reset?.();
      setMessage(success);
      router.refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setPending(null);
    }
  }

  function createAdvance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run("submit-advance", {
      action: "submit_advance",
      clubId: initialLedger.clubId,
      rotaryYearId: initialLedger.rotaryYearId,
      payerMembershipId: null,
      amount: Number(amount),
      description,
      incurredOn,
      idempotencyKey: idempotencyKey(),
    }, "代墊申請已送出，等候幹部核對。", () => {
      setAmount("");
      setDescription("");
    });
  }

  function resubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const advanceId = String(form.get("advanceId") ?? "");
    void run(`resubmit-${advanceId}`, {
      action: "resubmit_advance",
      clubId: initialLedger.clubId,
      advanceId,
      note: String(form.get("note") ?? "").trim() || null,
    }, "代墊已重新送出。", () => event.currentTarget.reset());
  }

  return <div className={styles.member}>
    <section className={styles.metrics} aria-label="我的社費摘要">
      <div><span>應收</span><strong>{moneyFormatter.format(receivableAmount)}</strong></div>
      <div><span>已收</span><strong>{moneyFormatter.format(receivedAmount)}</strong></div>
      <div><span>尚未繳清</span><strong>{moneyFormatter.format(outstandingAmount)}</strong></div>
    </section>
    {message && <Notice tone={message.includes("已") && !message.includes("沒有完成") ? "success" : "error"}>{message}</Notice>}

    <section aria-labelledby="my-dues-receivables-heading">
      <div className="section-heading"><div><p className="eyebrow">我的社費</p><h2 id="my-dues-receivables-heading">應收與收款</h2></div><span>{initialLedger.receivables.length} 筆應收</span></div>
      {initialLedger.receivables.length === 0 ? <Card><p>本年度目前沒有建立給您的應收項目。</p></Card> : <div className={styles.list}>{initialLedger.receivables.map((entry) => <Card key={entry.receivableId} className={styles.card}>
        <div className={styles.cardHeading}><div><h3>{entry.sourceKind === "opening_balance" ? "期初餘額" : entry.sourceKind === "annual_default" ? "年度社費" : "個別應收"}</h3><small>{entry.sourceNote}</small></div><Badge tone={entry.status === "paid" ? "success" : entry.status === "partial" ? "warning" : "neutral"}>{entry.status === "paid" ? "已收清" : entry.status === "partial" ? "部分收款" : "未收"}</Badge></div>
        <dl className={styles.amounts}><div><dt>應收</dt><dd>{moneyFormatter.format(entry.receivableAmount)}</dd></div><div><dt>已收</dt><dd>{moneyFormatter.format(entry.receivedAmount)}</dd></div><div><dt>未收</dt><dd>{moneyFormatter.format(entry.outstandingAmount)}</dd></div></dl>
      </Card>)}</div>}
    </section>

    <section aria-labelledby="my-dues-receipts-heading">
      <div className="section-heading"><div><p className="eyebrow">收款明細</p><h2 id="my-dues-receipts-heading">已收到的款項</h2></div><span>{initialLedger.receipts.length} 筆</span></div>
      {initialLedger.receipts.length === 0 ? <Card><p>目前沒有收款明細。</p></Card> : <div className={styles.list}>{initialLedger.receipts.map((receipt) => <Card key={receipt.receiptId} className={styles.card}><div className={styles.cardHeading}><div><h3>{moneyFormatter.format(receipt.amount)}</h3><small>{dateFormatter.format(new Date(`${receipt.receivedOn}T00:00:00Z`))}{receipt.referenceNote ? ` · ${receipt.referenceNote}` : ""}</small></div><Badge tone={receipt.status === "posted" ? "success" : "warning"}>{receipt.status === "posted" ? "有效" : "已沖銷"}</Badge></div></Card>)}</div>}
    </section>

    <Card>
      <div className="section-heading"><div><p className="eyebrow">社員代墊</p><h2>申請代墊核銷</h2></div></div>
      <p>如果您先替社團支付費用，可以在這裡留下申請；幹部核准前都可以看到處理狀態。</p>
      <form className="form-stack" onSubmit={createAdvance}>
        <Field label="金額"><Input type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required disabled={pending !== null} /></Field>
        <Field label="支出日期"><Input type="date" value={incurredOn} onChange={(event) => setIncurredOn(event.target.value)} required disabled={pending !== null} /></Field>
        <Field label="支出說明"><Input value={description} onChange={(event) => setDescription(event.target.value)} minLength={2} maxLength={1000} required placeholder="例如：服務活動材料" disabled={pending !== null} /></Field>
        <Button type="submit" disabled={pending !== null}>送出代墊申請</Button>
      </form>
    </Card>

    <section aria-labelledby="my-dues-advances-heading">
      <div className="section-heading"><div><p className="eyebrow">申請狀態</p><h2 id="my-dues-advances-heading">我的代墊</h2></div><span>{initialLedger.advances.length} 筆</span></div>
      {initialLedger.advances.length === 0 ? <Card><p>尚未提出代墊申請。</p></Card> : <div className={styles.list}>{initialLedger.advances.map((advance) => <Card key={advance.advanceId} className={styles.card}>
        <div className={styles.cardHeading}><div><h3>{moneyFormatter.format(advance.amount)}</h3><small>{advance.incurredOn} · {advance.description}</small></div><Badge tone={advance.advanceStatus === "closed" ? "success" : advance.advanceStatus === "returned" ? "danger" : "warning"}>{advance.advanceStatus === "closed" ? "已結案" : advance.advanceStatus === "returned" ? "請補件" : "待幹部審核"}</Badge></div>
        <dl className={styles.amounts}><div><dt>已核銷</dt><dd>{moneyFormatter.format(advance.reconciledAmount)}</dd></div><div><dt>待核銷</dt><dd>{moneyFormatter.format(advance.outstandingAmount)}</dd></div></dl>
        {advance.advanceStatus === "returned" && <form className={styles.resubmit} onSubmit={resubmit}><input type="hidden" name="advanceId" value={advance.advanceId} /><Field label="補充說明（選填）"><Input name="note" maxLength={500} disabled={pending !== null} /></Field><Button type="submit" className="button-secondary" disabled={pending !== null}>重新送出</Button></form>}
        {advance.reconciliations.length > 0 && <div className={styles.history}><strong>核銷紀錄</strong>{advance.reconciliations.map((entry) => <span key={entry.reconciliationId}>{moneyFormatter.format(entry.amount)} · {entry.status === "posted" ? "有效" : "已反向"}</span>)}</div>}
      </Card>)}</div>}
    </section>
  </div>;
}

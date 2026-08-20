import type { CSSProperties } from "react";
import type { BlessingIouRotaryYearReport } from "@/lib/blessing-iou/reporting-contracts";
import styles from "./blessing-iou-report.module.css";

const moneyFormatter = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
});

function monthLabel(value: string) {
  const [year, month] = value.split("-");
  return `${year} 年 ${Number(month)} 月`;
}

export function BlessingIouReport({ report }: { report: BlessingIouRotaryYearReport }) {
  const maximumMonthlyPledge = Math.max(1, ...report.months.map((month) => month.pledgedAmount));
  const summary = report.summary;
  return <div className={styles.report}>
    <section className={styles.metrics} aria-label="扶輪年度 IOU 摘要">
      <div><span>年度承諾</span><strong>{moneyFormatter.format(summary.pledgedAmount)}</strong><small>{summary.entryCount} 筆 · {summary.memberCount} 位社員</small></div>
      <div><span>有效收款</span><strong>{moneyFormatter.format(summary.receivedAmount)}</strong><small>{summary.paidEntryCount} 筆已收清</small></div>
      <div><span>尚未收款</span><strong>{moneyFormatter.format(summary.outstandingAmount)}</strong><small>{summary.partialEntryCount} 筆部分收款 · {summary.unpaidEntryCount} 筆未收</small></div>
    </section>

    <section aria-labelledby="report-months-title">
      <div className={styles.sectionHeading}>
        <div><p className={styles.eyebrow}>12 個月份</p><h2 id="report-months-title">每月統計</h2></div>
      </div>
      <div className={styles.tableWrap}><table>
        <thead><tr><th>月份</th><th>筆數／社員</th><th>承諾</th><th>已收</th><th>未收</th></tr></thead>
        <tbody>{report.months.map((month) => {
          const width = `${Math.round((month.pledgedAmount / maximumMonthlyPledge) * 100)}%`;
          return <tr key={month.month}>
            <td><strong>{monthLabel(month.month)}</strong><span
              className={styles.monthBar}
              style={{ "--bar-width": width } as CSSProperties}
              aria-hidden="true"
            /></td>
            <td>{month.entryCount} 筆<small>{month.memberCount} 位社員</small></td>
            <td>{moneyFormatter.format(month.pledgedAmount)}</td>
            <td className={styles.received}>{moneyFormatter.format(month.receivedAmount)}</td>
            <td className={month.outstandingAmount > 0 ? styles.outstanding : undefined}>{moneyFormatter.format(month.outstandingAmount)}</td>
          </tr>;
        })}</tbody>
      </table></div>
    </section>

    <section aria-labelledby="report-members-title">
      <div className={styles.sectionHeading}>
        <div><p className={styles.eyebrow}>社員彙總</p><h2 id="report-members-title">每位社員年度 IOU</h2></div>
        <span>依未收金額排序</span>
      </div>
      {report.members.length === 0 ? <div className={styles.empty}><strong>本扶輪年度沒有捐款承諾</strong><span>有社員填寫金額後，統計會自動出現在這裡。</span></div>
        : <div className={styles.tableWrap}><table>
          <thead><tr><th>社員</th><th>筆數</th><th>承諾</th><th>已收</th><th>未收</th><th>收款進度</th></tr></thead>
          <tbody>{report.members.map((member) => <tr key={member.authorMembershipId}>
            <td><strong>{member.authorDisplayName}</strong></td>
            <td>{member.entryCount}</td>
            <td>{moneyFormatter.format(member.pledgedAmount)}</td>
            <td className={styles.received}>{moneyFormatter.format(member.receivedAmount)}</td>
            <td className={member.outstandingAmount > 0 ? styles.outstanding : undefined}>{moneyFormatter.format(member.outstandingAmount)}</td>
            <td><span className={styles.statuses}>
              {member.paidEntryCount > 0 && <small className={styles.paid}>{member.paidEntryCount} 收清</small>}
              {member.partialEntryCount > 0 && <small className={styles.partial}>{member.partialEntryCount} 部分</small>}
              {member.unpaidEntryCount > 0 && <small className={styles.unpaid}>{member.unpaidEntryCount} 未收</small>}
            </span></td>
          </tr>)}</tbody>
        </table></div>}
    </section>
  </div>;
}

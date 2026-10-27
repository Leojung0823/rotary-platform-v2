import Link from "next/link";
import type { DiscussionTopicSummary } from "@/lib/discussion-topics/contracts";
import styles from "./topic-list.module.css";

const deadlineFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function DiscussionTopicListCard({
  topic,
  href,
  managementView = false,
}: {
  topic: DiscussionTopicSummary;
  href: string;
  managementView?: boolean;
}) {
  const audienceDescription = topic.audienceKind === "all"
    ? "全體社員"
    : topic.audienceKind === "tags"
      ? topic.audienceTags?.length
        ? `標籤：${topic.audienceTags.join("、")}`
        : "指定社員標籤"
      : `${topic.audienceCount ?? 0} 位指定社員`;

  return <Link className={styles.card} href={href} prefetch={false}>
    <div className={styles.cardTop}>
      <span className={`${styles.status} ${topic.isOpen ? "" : styles.closed}`}>
        <span className={styles.statusDot} aria-hidden="true" />
        {topic.isOpen ? "討論中" : "已截止"}
      </span>
      {managementView
        ? <span className={styles.pill}>{topic.audienceCount ?? 0} 位對象</span>
        : topic.isOpen && !topic.hasVoted
          ? <span className={`${styles.pill} ${styles.pending}`}>尚未投票</span>
          : topic.hasVoted
            ? <span className={`${styles.pill} ${styles.complete}`}>已投票</span>
            : null}
    </div>

    <div className={styles.content}>
      <h3 className={styles.title}>{topic.title}</h3>
      <p className={styles.description}>{topic.description}</p>
    </div>

    {managementView && <p className={styles.audience}>
      {audienceDescription}<span aria-hidden="true"> · </span>{topic.anonymousVotes ? "匿名投票" : "具名投票"}
    </p>}

    <dl className={styles.metadata}>
      <div className={styles.deadline}>
        <dt>截止時間</dt>
        <dd><time dateTime={topic.deadlineAt}>{deadlineFormatter.format(new Date(topic.deadlineAt))}</time></dd>
      </div>
      <div className={styles.metric}>
        <dt>投票</dt>
        <dd>{topic.voteCount} 人</dd>
      </div>
      <div className={styles.metric}>
        <dt>留言</dt>
        <dd>{topic.commentCount} 則</dd>
      </div>
    </dl>

    <span className={styles.action}>
      <span>{managementView ? "查看與管理" : topic.hasVoted ? "查看或修改投票" : "查看並參與"}</span>
      <span className={styles.arrow} aria-hidden="true">→</span>
    </span>
  </Link>;
}

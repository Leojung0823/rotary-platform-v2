import Link from "next/link";
import { addDiscussionCommentAction, castDiscussionVoteAction } from "@/app/discussion-topic-actions";
import { Button, Card, Field } from "@/components/ui";
import type { DiscussionTopicDetail } from "@/lib/discussion-topics/contracts";
import styles from "./topic-detail.module.css";

const taipeiDateTime = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric", month: "long", day: "numeric", weekday: "short",
  hour: "2-digit", minute: "2-digit", hour12: false,
});

export function DiscussionTopicDetailView({
  clubId,
  topic,
  managementView = false,
}: {
  clubId: string;
  topic: DiscussionTopicDetail;
  managementView?: boolean;
}) {
  const returnHref = managementView
    ? "/clubs/" + encodeURIComponent(clubId) + "/topics?mode=management"
    : "/topics?clubId=" + encodeURIComponent(clubId) + "&mode=member";
  const voteLabel = topic.anonymousVotes ? "匿名投票" : "具名投票";

  return <div className="page-stack">
    <header className="page-header">
      <div>
        <p className="eyebrow">{managementView ? "社務管理 · 議題討論" : "社內互動 · 議題討論"}</p>
        <h1>{topic.title}</h1>
        <p>截止時間：{taipeiDateTime.format(new Date(topic.deadlineAt))} · {voteLabel}</p>
      </div>
      <Link className="button button-secondary" href={returnHref} prefetch={false}>
        {managementView ? "返回議題管理" : "所有議題"}
      </Link>
    </header>

    <Card>
      <div className={styles.description}>{topic.description}</div>
      <p className={styles.state}>{topic.isOpen ? "討論與投票進行中" : "已截止：目前只能閱讀"}</p>
      {managementView && !topic.anonymousVotes && <p className={styles.privacy}>具名投票名單只在社務管理模式顯示。</p>}
    </Card>

    <Card>
      <div className="section-heading"><div><p className="eyebrow">投票</p><h2>選擇一個答案</h2></div>
        <span>{topic.voteCount} 人已投票</span></div>
      <div className={styles.options}>
        {topic.options.map((option) => {
          const selected = topic.myVoteOptionId === option.id;
          return <div className={styles.option} key={option.id}>
            <div className={styles.optionLabel}>
              <strong>{option.label}</strong>
              <span>{option.voteCount} 票</span>
            </div>
            {!managementView && topic.isOpen && <form action={castDiscussionVoteAction}>
              <input type="hidden" name="clubId" value={clubId} />
              <input type="hidden" name="topicId" value={topic.id} />
              <input type="hidden" name="optionId" value={option.id} />
              <Button type="submit" className={selected ? "button-secondary" : ""}>
                {selected ? "已選擇，可改票" : "投這一票"}
              </Button>
            </form>}
            {selected && <span className={styles.selected}>您目前選擇</span>}
          </div>;
        })}
      </div>
    </Card>

    {managementView && topic.namedVotes.length > 0 && <Card>
      <div className="section-heading"><div><p className="eyebrow">幹部檢視</p><h2>具名投票名單</h2></div></div>
      <ul className={styles.voters}>
        {topic.namedVotes.map((vote) => <li key={vote.membershipId}>
          <strong>{vote.displayName}</strong><span>{vote.optionText}</span>
        </li>)}
      </ul>
    </Card>}

    <Card>
      <div className="section-heading"><div><p className="eyebrow">社員留言</p><h2>討論內容</h2></div>
        <span>{topic.commentCount} 則</span></div>
      {topic.comments.length === 0
        ? <p className={styles.empty}>目前還沒有留言，歡迎留下第一個想法。</p>
        : <ol className={styles.comments}>
          {topic.comments.map((comment) => <li key={comment.id}>
            <div className={styles.commentHead}>
              <strong>{comment.authorDisplayName}</strong>
              <time dateTime={comment.createdAt}>{taipeiDateTime.format(new Date(comment.createdAt))}</time>
            </div>
            <p>{comment.body}</p>
          </li>)}
        </ol>}
      {!managementView && topic.isOpen && <form action={addDiscussionCommentAction} className={styles.commentForm}>
        <input type="hidden" name="clubId" value={clubId} />
        <input type="hidden" name="topicId" value={topic.id} />
        <Field label="新增留言">
          <textarea className="input" name="body" required maxLength={2000} rows={3}
            placeholder="請分享看法，彼此尊重、聚焦議題。" />
        </Field>
        <div className="form-actions"><Button type="submit">送出留言</Button></div>
      </form>}
      {!topic.isOpen && <p className={styles.closed}>截止後保留所有留言供社員閱讀。</p>}
    </Card>
  </div>;
}

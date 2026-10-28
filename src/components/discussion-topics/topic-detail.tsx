import Link from "next/link";
import { addDiscussionCommentAction } from "@/app/discussion-topic-actions";
import { ManagementTopicActions } from "@/components/discussion-topics/management-topic-actions";
import { DiscussionVoteControls } from "@/components/discussion-topics/vote-controls";
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
    {managementView && <ManagementTopicActions clubId={clubId} topicId={topic.id} />}

    <Card>
      <div className={styles.description}>{topic.description}</div>
      <p className={styles.state}>{topic.isOpen ? "討論與投票進行中" : "已截止：目前只能閱讀"}</p>
      <p className={styles.privacy}>參與這個議題的人可以看到誰已投票。{topic.anonymousVotes
        ? "匿名投票不顯示個人選擇，但人數少時仍可能從票數推測。"
        : "只有社務管理幹部可以查看個人的投票選項。"}</p>
      {managementView && !topic.anonymousVotes && <p className={styles.privacy}>具名投票名單只在社務管理模式顯示。</p>}
    </Card>

    {!managementView && topic.isOpen
      ? <DiscussionVoteControls clubId={clubId} topicId={topic.id} initialOptions={topic.options}
        initialVoteCount={topic.voteCount} initialMyVoteOptionId={topic.myVoteOptionId} initialVoters={topic.voters} />
      : <>
    <Card>
      <div className="section-heading"><div><p className="eyebrow">投票</p><h2>選擇一個答案</h2></div>
        {managementView && <span>{topic.voteCount} 人已投票</span>}</div>
      <div className={styles.options}>
          {topic.options.map((option) => {
            const selected = topic.myVoteOptionId === option.id;
            return <div className={styles.option} key={option.id}>
              <div className={styles.optionLabel}>
                <strong>{option.label}</strong>
                <span>{option.voteCount} 票</span>
              </div>
              {selected && <span className={styles.selected}>您目前選擇</span>}
            </div>;
          })}
        </div>
    </Card>
    <Card>
      <div className="section-heading"><div><p className="eyebrow">投票進度</p><h2>已投票的社員</h2></div>
        <span>{topic.voteCount} 人已投票</span></div>
      {topic.voters.length === 0 ? <p className={styles.empty}>目前還沒有人投票。</p>
        : <ul className={styles.voters}>{topic.voters.map((voter) => <li key={voter.membershipId}>
          <strong>{voter.displayName}</strong>
        </li>)}</ul>}
    </Card>
    </>}

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

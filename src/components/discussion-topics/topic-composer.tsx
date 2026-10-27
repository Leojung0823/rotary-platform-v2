import { AudiencePicker, type AudienceMember, type AudienceTag } from "@/components/audience/audience-picker";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { publishDiscussionTopicAction, updateDiscussionTopicAction } from "@/app/discussion-topic-actions";
import { audienceFromEvent } from "@/lib/audience/selection";
import type { DiscussionTopicEditData } from "@/lib/discussion-topics/contracts";

function dateTimeLocal(value: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function DiscussionTopicComposer({ clubId, tags, members, initialTopic }: {
  clubId: string;
  tags: readonly AudienceTag[];
  members: readonly AudienceMember[];
  initialTopic?: DiscussionTopicEditData;
}) {
  const editing = initialTopic !== undefined;
  const lockedTopic = initialTopic && (initialTopic.voteCount > 0 || initialTopic.commentCount > 0)
    ? initialTopic : undefined;
  const selection = initialTopic
    ? audienceFromEvent(initialTopic.audienceTagIds, initialTopic.audienceMembershipIds)
    : undefined;
  const audienceMode = initialTopic?.audienceKind === "tags" ? "tags"
    : initialTopic?.audienceKind === "people" ? "members" : "everyone";

  return <Card>
    <div className="section-heading"><div>
      <p className="eyebrow">{editing ? "管理議題" : "發起討論"}</p>
      <h2>{editing ? "編輯議題" : "發布新議題"}</h2>
    </div></div>
    <p>指定對象會在社員模式看到議題並收到待辦投票提醒。截止後仍可閱讀，但不能再留言或投票。</p>
    {lockedTopic && <Notice>這個議題已有投票或留言。為保護既有意見與投票隱私，參與對象、投票選項及匿名／具名方式不能再更改；標題、說明與截止時間仍可編輯。</Notice>}
    <form action={editing ? updateDiscussionTopicAction : publishDiscussionTopicAction} className="form-stack">
      <input type="hidden" name="clubId" value={clubId} />
      <input type="hidden" name="mode" value="management" />
      {editing && <input type="hidden" name="topicId" value={initialTopic.id} />}
      <Field label="議題名稱"><Input name="title" required minLength={2} maxLength={120}
        defaultValue={initialTopic?.title} placeholder="例如：下半年社區服務要優先做什麼？" /></Field>
      <Field label="議題說明"><textarea className="input" name="description" required maxLength={5000} rows={5}
        defaultValue={initialTopic?.description} placeholder="補充背景、討論重點或希望社員思考的問題。" /></Field>
      <Field label="投票選項" hint="每行一個選項，至少 2 個、最多 8 個；單選，可在截止前修改。">
        {lockedTopic
          ? <>
            <p>{lockedTopic.options.map((option) => option.label).join("、")}</p>
            <input type="hidden" name="options" value={lockedTopic.options.map((option) => option.label).join("\n")} />
          </>
          : <textarea className="input" name="options" required rows={4}
            defaultValue={initialTopic?.options.map((option) => option.label).join("\n")}
            placeholder={"擴大服務規模\n維持目前做法\n先試辦一季"} />}
      </Field>
      <Field label="截止時間（台灣時間）"><Input name="deadlineAt" type="datetime-local" required
        defaultValue={initialTopic ? dateTimeLocal(initialTopic.deadlineAt) : undefined} /></Field>
      {lockedTopic ? <>
        <input type="hidden" name="audienceMode" value={audienceMode} />
        {lockedTopic.audienceTagIds.map((id) => <input key={id} type="hidden" name="audienceTagIds" value={id} />)}
        {lockedTopic.audienceMembershipIds.map((id) => <input key={id} type="hidden" name="audienceMembershipIds" value={id} />)}
        <input type="hidden" name="voteMode" value={lockedTopic.anonymousVotes ? "anonymous" : "named"} />
        <p><strong>參與對象：</strong>{lockedTopic.audienceKind === "all" ? "全體社員"
          : lockedTopic.audienceKind === "tags" ? (lockedTopic.audienceTagIds.length ? "原指定標籤對象" : "原參與對象")
            : "原指定社員"}</p>
        <p><strong>投票方式：</strong>{lockedTopic.anonymousVotes ? "匿名投票" : "具名投票"}</p>
      </> : <>
        <fieldset className="form-stack">
          <legend className="label">誰可以看到這個議題</legend>
          <AudiencePicker clubId={clubId} tags={tags} members={members} initial={selection} />
        </fieldset>
        <fieldset className="form-stack">
          <legend className="label">投票方式</legend>
          <label className="tag-option"><input type="radio" name="voteMode" value="anonymous"
            defaultChecked={initialTopic?.anonymousVotes ?? true} /> 匿名投票（任何人都看不到個別投票者）</label>
          <label className="tag-option"><input type="radio" name="voteMode" value="named"
            defaultChecked={initialTopic ? !initialTopic.anonymousVotes : undefined} /> 具名投票（只有社務管理幹部能查看誰投了哪一票）</label>
          <p className="hint">社員都能看投票統計；留言會顯示留言者姓名。</p>
        </fieldset>
      </>}
      <div className="form-actions"><Button type="submit">{editing ? "儲存修改" : "發布議題"}</Button></div>
    </form>
  </Card>;
}

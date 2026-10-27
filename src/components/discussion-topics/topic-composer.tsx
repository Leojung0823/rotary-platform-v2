import { AudiencePicker, type AudienceMember, type AudienceTag } from "@/components/audience/audience-picker";
import { Button, Card, Field, Input } from "@/components/ui";
import { publishDiscussionTopicAction } from "@/app/discussion-topic-actions";

export function DiscussionTopicComposer({ clubId, tags, members }: {
  clubId: string; tags: readonly AudienceTag[]; members: readonly AudienceMember[];
}) {
  return <Card>
    <div className="section-heading"><div><p className="eyebrow">發起討論</p><h2>發布新議題</h2></div></div>
    <p>指定對象會在社員模式看到議題並收到待辦投票提醒。截止後仍可閱讀，但不能再留言或投票。</p>
    <form action={publishDiscussionTopicAction} className="form-stack">
      <input type="hidden" name="clubId" value={clubId} />
      <input type="hidden" name="mode" value="management" />
      <Field label="議題名稱"><Input name="title" required minLength={2} maxLength={120} placeholder="例如：下半年社區服務要優先做什麼？" /></Field>
      <Field label="議題說明"><textarea className="input" name="description" required maxLength={5000} rows={5} placeholder="補充背景、討論重點或希望社員思考的問題。" /></Field>
      <Field label="投票選項" hint="每行一個選項，至少 2 個、最多 8 個；單選，可在截止前修改。">
        <textarea className="input" name="options" required rows={4} placeholder={"擴大服務規模\n維持目前做法\n先試辦一季"} />
      </Field>
      <Field label="截止時間（台灣時間）"><Input name="deadlineAt" type="datetime-local" required /></Field>
      <fieldset className="form-stack">
        <legend className="label">誰可以看到這個議題</legend>
        <AudiencePicker clubId={clubId} tags={tags} members={members} />
      </fieldset>
      <fieldset className="form-stack">
        <legend className="label">投票方式</legend>
        <label className="tag-option"><input type="radio" name="voteMode" value="anonymous" defaultChecked /> 匿名投票（任何人都看不到個別投票者）</label>
        <label className="tag-option"><input type="radio" name="voteMode" value="named" /> 具名投票（只有社務管理幹部能查看誰投了哪一票）</label>
        <p className="hint">社員都能看投票統計；留言會顯示留言者姓名。</p>
      </fieldset>
      <div className="form-actions"><Button type="submit">發布議題</Button></div>
    </form>
  </Card>;
}

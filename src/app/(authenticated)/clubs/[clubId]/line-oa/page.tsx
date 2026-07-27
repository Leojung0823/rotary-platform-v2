import { configureLineOaAction, pairLineOaAction, unpairLineOaAction } from "@/app/actions";
import { sendClubLineOaAction } from "@/app/line-oa-actions";
import { createClient } from "@/lib/supabase/server";
import { ClubAdminNav } from "@/components/club-admin-nav";
import { Badge, Button, Card, Field, Input, Notice, Select } from "@/components/ui";
import { safeMessage } from "@/lib/validation";
import type { MemberRow } from "../members/page";

type OaAdmin = {
  account: {
    id: string;
    display_name: string;
    basic_id: string | null;
    channel_id: string | null;
    rich_menu_id: string | null;
    status: string;
  } | null;
  followers: {
    id: string;
    oa_user_id: string;
    status: string;
    person_id: string | null;
    display_name: string | null;
    paired_at: string | null;
  }[];
  push_logs: { id: string; kind: string; recipient_count: number; status: string; created_at: string }[];
  webhooks: { id: number; event_type: string; signature_valid: boolean; status: string; received_at: string }[];
};

export default async function LineOaPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { clubId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const [oaResult, membersResult] = await Promise.all([
    supabase.rpc("get_line_oa_admin", { p_club_id: clubId }),
    supabase.rpc("list_club_members", { p_club_id: clubId, p_query: null, p_status: "active" }),
  ]);
  if (oaResult.error) return <Notice tone="error">您沒有查看 LINE OA 的權限。</Notice>;
  const oa = oaResult.data as OaAdmin;
  const members = (membersResult.data ?? []) as MemberRow[];
  const success: Record<string, string> = {
    configured: "LINE OA 設定已儲存。",
    paired: "OA follower 已配對社員。",
    unpaired: "OA 配對已解除，LINE Login 不受影響。",
    message_sent: "訊息已由本社專屬 OA 憑證送出，或由 local mock 完成。",
  };

  return <div className="page-stack">
    <header>
      <p className="eyebrow">通訊模組</p>
      <h1>LINE Official Account</h1>
      <p>Webhook、好友配對與訊息推播；每個扶輪社使用獨立 credential reference，此模組不參與登入。</p>
    </header>
    <ClubAdminNav clubId={clubId} />
    {query.error && <Notice tone="error">{safeMessage(query.error)}</Notice>}
    {query.success && <Notice tone="success">{success[query.success]}</Notice>}

    <div className="two-column">
      <Card>
        <h2>OA 設定</h2>
        <form action={configureLineOaAction} className="form-stack">
          <input type="hidden" name="clubId" value={clubId} />
          <Field label="顯示名稱"><Input name="displayName" required defaultValue={oa.account?.display_name ?? "本社 LINE OA"} /></Field>
          <Field label="Basic ID"><Input name="basicId" placeholder="@rotary" defaultValue={oa.account?.basic_id ?? ""} /></Field>
          <Field label="Channel ID（非 secret）"><Input name="channelId" defaultValue={oa.account?.channel_id ?? ""} /></Field>
          <Notice>Channel secret 與 access token 依本社 OA credential reference 從 server environment 讀取，不儲存在瀏覽器或一般資料欄位，也不會回退到全域 token。</Notice>
          <Button type="submit">儲存 OA 設定</Button>
        </form>
      </Card>
      <Card>
        <h2>Webhook</h2>
        <p>Server 會限制 request body 與 events 數量，使用本社專屬 secret 驗證原始 body，簽章失敗時不逐筆寫入事件。</p>
        <div className="token-value">{`${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/api/line-oa/webhook/${clubId}`}</div>
        <div className="status-pair">
          <Badge tone={oa.webhooks[0]?.signature_valid ? "success" : "neutral"}>{oa.webhooks[0]?.signature_valid ? "最近簽章有效" : "尚無有效事件"}</Badge>
          <Badge tone={process.env.LINE_OA_MODE === "line" ? "success" : "warning"}>{process.env.LINE_OA_MODE === "line" ? "LINE Messaging API" : "Local Mock"}</Badge>
        </div>
      </Card>
    </div>

    {oa.account && <Card>
      <h2>Broadcast / Multicast</h2>
      <form action={sendClubLineOaAction} className="inline-form">
        <input type="hidden" name="clubId" value={clubId} />
        <Field label="模式">
          <Select name="kind">
            <option value="broadcast">Broadcast</option>
            <option value="multicast">Multicast 已配對社員</option>
          </Select>
        </Field>
        <Field label="訊息"><Input name="message" required maxLength={2000} placeholder="輸入測試訊息" /></Field>
        <Button type="submit">送出訊息</Button>
      </form>
      <p className="subtle">不合法的推播種類會直接拒絕，不會默認成 Broadcast。</p>
    </Card>}

    <Card>
      <h2>手動配對 OA follower</h2>
      <form action={pairLineOaAction} className="inline-form">
        <input type="hidden" name="clubId" value={clubId} />
        <Field label="社員">
          <Select name="personId" required>
            <option value="">選擇社員</option>
            {members.map(member => <option key={member.person_id} value={member.person_id}>{member.display_name}</option>)}
          </Select>
        </Field>
        <Field label="OA userId"><Input name="oaUserId" required placeholder="U..." /></Field>
        <Button type="submit">建立配對</Button>
      </form>
    </Card>

    <section>
      <div className="section-heading"><h2>Follower 配對</h2><span>{oa.followers.filter(item => item.status === "following").length} 位</span></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>OA user</th><th>社員</th><th>狀態</th><th>操作</th></tr></thead>
          <tbody>{oa.followers.map(follower => <tr key={follower.id}>
            <td><code>{follower.oa_user_id.slice(0, 10)}…</code></td>
            <td>{follower.display_name ?? "未配對"}</td>
            <td><Badge tone={follower.status === "following" ? "success" : "neutral"}>{follower.status}</Badge></td>
            <td>{follower.status === "following" && <form action={unpairLineOaAction}>
              <input type="hidden" name="clubId" value={clubId} />
              <input type="hidden" name="followerId" value={follower.id} />
              <input type="hidden" name="reason" value="後台解除 OA 配對" />
              <Button type="submit" className="button-secondary">解除 OA 配對</Button>
            </form>}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    <section>
      <div className="section-heading"><h2>推播紀錄</h2></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>時間</th><th>類型</th><th>收件數</th><th>狀態</th></tr></thead>
          <tbody>{oa.push_logs.map(log => <tr key={log.id}>
            <td>{new Intl.DateTimeFormat("zh-TW", { dateStyle: "short", timeStyle: "short" }).format(new Date(log.created_at))}</td>
            <td>{log.kind}</td>
            <td>{log.recipient_count}</td>
            <td><Badge tone={log.status === "sent" || log.status === "mocked" ? "success" : "danger"}>{log.status}</Badge></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  </div>;
}

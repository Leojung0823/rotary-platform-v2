import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createBirthdayWishAction,
  deleteBirthdayWishAction,
  hideBirthdayWishAction,
  setBirthdayPreferenceAction,
  updateBirthdayWishAction,
} from "@/app/birthday-actions";
import { DirectoryAvatar } from "@/components/directory-avatar";
import { Badge, Button, Card, EmptyState, Field, Notice, Select } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import { parseBirthdayPageProjection } from "@/lib/birthdays/contracts";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { createClient } from "@/lib/supabase/server";
import styles from "./birthdays.module.css";

const successMessages: Record<string, string> = {
  preference_saved: "生日公開設定已儲存。",
  wish_created: "生日祝福已送出。",
  wish_updated: "生日祝福已更新。",
  wish_deleted: "生日祝福已刪除。",
  wish_hidden: "不適當的祝福已隱藏。",
};

const errorMessages: Record<string, string> = {
  invalid_input: "輸入內容不完整，請再試一次。",
  already_wished: "今年已經祝福過這位社員，可以直接修改原本的祝福。",
  birth_date_required: "請先到「我的」填寫生日，才能加入生日名單。",
  not_accepting: "這位社員目前沒有開放接收祝福。",
  forbidden: "您目前沒有執行這項操作的權限。",
  unexpected: "操作沒有完成，請稍後再試。",
};

function currentTaipeiMonthDay() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());
  const number = (type: "month" | "day") => Number(parts.find((part) => part.type === type)?.value ?? 1);
  return { month: number("month"), day: number("day") };
}

function upcomingDistance(month: number, day: number, today: { month: number; day: number }) {
  const candidate = month * 32 + day;
  const current = today.month * 32 + today.day;
  return candidate >= current ? candidate - current : candidate + 12 * 32 - current;
}

export default async function BirthdayPage({
  searchParams,
}: {
  searchParams: Promise<{ clubId?: string; success?: string; error?: string }>;
}) {
  const [identity, query] = await Promise.all([requireIdentity(), searchParams]);
  const evaluation = await evaluateCurrentFeatureFlag({
    key: "birthday_wishes_v1",
    subjectUuid: identity.id,
  });
  if (!evaluation.enabled) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_birthday_page", {
    p_club_id: query.clubId ?? null,
  });

  if (error || !data) {
    return <div className="page-stack">
      <BirthdayHeader />
      <Notice tone="error">目前無法確認社籍與生日祝福權限，請稍後重新整理。</Notice>
    </div>;
  }

  let page;
  try {
    page = parseBirthdayPageProjection(data);
  } catch {
    return <div className="page-stack">
      <BirthdayHeader />
      <Notice tone="error">生日祝福資料格式不完整，系統已停止顯示，避免誤放其他扶輪社資料。</Notice>
    </div>;
  }

  const selectedClub = page.clubs.find((club) => club.clubId === page.selectedClubId) ?? null;
  const today = currentTaipeiMonthDay();
  const birthdays = [...page.birthdays].sort((left, right) => (
    upcomingDistance(left.birthMonth, left.birthDay, today)
    - upcomingDistance(right.birthMonth, right.birthDay, today)
  ));
  const authoredRecipientIds = new Set(
    page.wishes.filter((wish) => wish.canEdit).map((wish) => wish.recipientMembershipId),
  );

  return <div className="page-stack">
    <BirthdayHeader />

    {query.success && successMessages[query.success] && <Notice tone="success">{successMessages[query.success]}</Notice>}
    {query.error && <Notice tone="error">{errorMessages[query.error] ?? errorMessages.unexpected}</Notice>}

    {page.clubs.length > 1 && <form className="inline-form" action="/birthdays">
      <Field label="扶輪社">
        <Select name="clubId" defaultValue={page.selectedClubId ?? ""}>
          {page.clubs.map((club) => <option key={club.clubId} value={club.clubId}>{club.clubName}</option>)}
        </Select>
      </Field>
      <Button type="submit">切換扶輪社</Button>
    </form>}

    {!selectedClub ? <EmptyState title="目前沒有可查看的生日名單" body="有效社員或有管理權限的幹部才可使用這個功能。" /> : <>
      <Card className={styles.privacyCard}>
        <div>
          <p className="eyebrow">隱私由您決定</p>
          <h2>我的生日公開設定</h2>
          <p>預設不公開。開啟後只顯示月、日，不會顯示出生年份或完整生日。</p>
        </div>
        {page.myPreference ? <form action={setBirthdayPreferenceAction} className={styles.preferenceForm}>
          <input type="hidden" name="clubId" value={selectedClub.clubId} />
          {!page.myPreference.hasBirthDate && <Notice>
            尚未填寫生日。請先到 <Link className={styles.inlineLink} href="/me">我的資料</Link> 完成設定。
          </Notice>}
          <label className="checkbox-row">
            <input
              type="checkbox"
              name="isListed"
              defaultChecked={page.myPreference.isListed}
              disabled={!page.myPreference.hasBirthDate}
            />
            <span><strong>在同社生日名單顯示我的月、日</strong><small>關閉後，原有祝福也不再顯示給社友。</small></span>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              name="allowWishes"
              defaultChecked={page.myPreference.allowWishes}
              disabled={!page.myPreference.hasBirthDate}
            />
            <span><strong>允許同社社員寫生日祝福</strong><small>每位社員每年可送一則，送出後可以修改或刪除。</small></span>
          </label>
          <Button type="submit" disabled={!page.myPreference.hasBirthDate}>儲存生日設定</Button>
        </form> : <Notice>您是這個扶輪社的管理者，但沒有有效社員社籍，因此可以協助管理內容，不能替自己公開生日或送出祝福。</Notice>}
      </Card>

      <section>
        <div className="section-heading">
          <div><p className="eyebrow">{selectedClub.clubCode}</p><h2>接下來的生日</h2></div>
          <span>{birthdays.length} 位社員選擇公開</span>
        </div>
        {birthdays.length === 0 ? <EmptyState title="還沒有人加入生日名單" body="每位社員都要自己開啟，系統不會自動公開生日。" /> : <div className={styles.birthdayGrid}>
          {birthdays.map((birthday) => <Card key={birthday.membershipId} className={styles.birthdayCard}>
            <div className={styles.memberHeading}>
              <DirectoryAvatar avatarUrl={birthday.avatarUrl} displayName={birthday.displayName} />
              <div>
                <h3>{birthday.displayName}{birthday.isSelf ? "（我）" : ""}</h3>
                <strong className={styles.date}>{birthday.birthMonth} 月 {birthday.birthDay} 日</strong>
              </div>
            </div>
            {birthday.isSelf ? <Badge tone="neutral">這是您的生日</Badge> : authoredRecipientIds.has(birthday.membershipId) ? <Badge tone="success">今年已祝福，可在下方修改</Badge> : birthday.allowWishes && page.myPreference ? <form action={createBirthdayWishAction} className="form-stack">
              <input type="hidden" name="clubId" value={selectedClub.clubId} />
              <input type="hidden" name="recipientMembershipId" value={birthday.membershipId} />
              <Field label={`寫給 ${birthday.displayName} 的祝福`} hint="1–500 字；同社社員都看得到。">
                <textarea className="input" name="content" required maxLength={500} rows={3} placeholder="祝你生日快樂、平安順心！" />
              </Field>
              <Button type="submit">送出祝福</Button>
            </form> : <Badge tone="neutral">未開放祝福</Badge>}
          </Card>)}
        </div>}
      </section>

      <section>
        <div className="section-heading">
          <div><p className="eyebrow">今年</p><h2>生日祝福牆</h2></div>
          <span>{page.wishes.length} 則祝福</span>
        </div>
        {page.wishes.length === 0 ? <EmptyState title="今年還沒有祝福" body="從上方選一位開放祝福的社員，送出第一句生日快樂。" /> : <div className={styles.wishList}>
          {page.wishes.map((wish) => <Card key={wish.id} className={styles.wishCard}>
            <div className={styles.wishMeta}>
              <div><strong>{wish.authorName}</strong><span>祝福 {wish.recipientName}</span></div>
              <time dateTime={wish.createdAt}>{new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium" }).format(new Date(wish.createdAt))}</time>
            </div>
            <p className={styles.wishContent}>{wish.content}</p>
            {(wish.canEdit || wish.canDelete || wish.canModerate) && <div className={styles.wishActions}>
              {wish.canEdit && <details>
                <summary>修改我的祝福</summary>
                <form action={updateBirthdayWishAction} className="form-stack">
                  <input type="hidden" name="clubId" value={selectedClub.clubId} />
                  <input type="hidden" name="wishId" value={wish.id} />
                  <textarea className="input" name="content" required maxLength={500} rows={3} defaultValue={wish.content} />
                  <Button type="submit">儲存修改</Button>
                </form>
              </details>}
              {wish.canDelete && <form action={deleteBirthdayWishAction}>
                <input type="hidden" name="clubId" value={selectedClub.clubId} />
                <input type="hidden" name="wishId" value={wish.id} />
                <Button className="button-secondary" type="submit">刪除我的祝福</Button>
              </form>}
              {wish.canModerate && <details>
                <summary>幹部管理</summary>
                <form action={hideBirthdayWishAction} className="form-stack">
                  <input type="hidden" name="clubId" value={selectedClub.clubId} />
                  <input type="hidden" name="wishId" value={wish.id} />
                  <Field label="隱藏原因">
                    <input className="input" name="reason" required minLength={2} maxLength={300} placeholder="例如：內容不適當" />
                  </Field>
                  <Button className="button-danger" type="submit">隱藏這則祝福</Button>
                </form>
              </details>}
            </div>}
          </Card>)}
        </div>}
      </section>
    </>}
  </div>;
}

function BirthdayHeader() {
  return <header className="page-header">
    <div>
      <p className="eyebrow">社員交流</p>
      <h1>生日祝福</h1>
      <p>社員自己決定是否公開月、日；祝福只在同一扶輪社內顯示。</p>
    </div>
    <Link className="button button-secondary" href="/features">返回功能總覽</Link>
  </header>;
}

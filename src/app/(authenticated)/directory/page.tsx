import { cookies } from "next/headers";
import Link from "next/link";
import { DirectoryAvatar } from "@/components/directory-avatar";
import { EmptyState, Notice } from "@/components/ui";
import { requireIdentity } from "@/lib/auth";
import {
  activeClubCookieName,
  readActiveClubPreference,
} from "@/lib/experience-context-cookie";
import {
  directoryRoleLabel,
  parseDirectoryClubs,
  parseDirectoryMembers,
} from "@/lib/members/directory";
import { createClient } from "@/lib/supabase/server";
import styles from "./directory-page.module.css";

export default async function MemberDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ clubId?: string; q?: string }>;
}) {
  const [, query, cookieStore] = await Promise.all([requireIdentity(), searchParams, cookies()]);
  const supabase = await createClient();
  const search = query.q?.trim().slice(0, 80) || null;
  // The club the shell switcher is pointing at. Without it this page fell back
  // to the first club the database returned, so a member of two clubs opened
  // the roster of whichever one sorted first rather than the one they were in.
  const activeClubId = readActiveClubPreference(cookieStore.get(activeClubCookieName)?.value);
  // One call: the database picks the club -- the one asked for if the member
  // may see it, otherwise the first -- so the member rows come back with the
  // club list instead of a round trip behind it.
  const pageResult = await supabase.rpc("list_my_directory_page", {
    p_club_id: query.clubId ?? activeClubId,
    p_query: search,
  });

  if (pageResult.error) {
    return <Notice tone="error">目前無法載入您可查看的社員名冊。</Notice>;
  }

  const projection = (pageResult.data ?? {}) as {
    clubs?: unknown;
    selected_club_id?: unknown;
    members?: unknown;
  };
  const clubs = parseDirectoryClubs(projection.clubs);
  if (clubs.length === 0) {
    return <div className="page-stack">
      <header className={styles.header}><div className={styles.heading}><p className="eyebrow">社員與身份</p><h1>社員名冊</h1></div></header>
      <EmptyState title="目前沒有可查看的名冊" body="只有有效社籍的社員能查看同社的有效社員名冊。" />
    </div>;
  }

  // The database already resolved which club it read members for. Deriving it a
  // second time here is what let the heading and the rows disagree.
  const selectedClubId = typeof projection.selected_club_id === "string"
    ? projection.selected_club_id.toLowerCase()
    : null;
  const selectedClub = clubs.find((club) => club.club_id === selectedClubId) ?? clubs[0];
  const members = parseDirectoryMembers(projection.members);

  return <div className="page-stack">
    <header className={styles.header}>
      <div className={styles.heading}>
        <p className="eyebrow">社員與身份</p>
        <h1>社員名冊</h1>
        <p>只顯示您目前所在社的有效社員；Email、手機與出生年份依每位社員的隱私設定公開。{clubs.length > 1 ? "要看另一個社，請用左側的社別切換。" : ""}</p>
      </div>
      <Link className={`button button-secondary ${styles.privacyAction}`} href="/me">我的資料與隱私</Link>
    </header>

    <form className="inline-form" action="/directory">
      <label className="field">
        <span className="label">搜尋社員姓名</span>
        <input className="input" name="q" defaultValue={query.q ?? ""} maxLength={80} placeholder="輸入姓名" />
      </label>
      <button className="button" type="submit">搜尋</button>
    </form>

    <section>
      <div className="section-heading">
        <div><p className="eyebrow">{selectedClub.club_code}</p><h2>{selectedClub.club_name}</h2></div>
        <span>{members.length} 位社員</span>
      </div>

      {members.length === 0
        ? <EmptyState title="找不到社員" body="請調整姓名搜尋條件。" />
        : <div className="directory-grid">
          {members.map((member) => <Link
            className="directory-card"
            key={member.membership_id}
            href={`/directory/${member.membership_id}?clubId=${encodeURIComponent(selectedClub.club_id)}`}
          >
            <DirectoryAvatar avatarUrl={member.avatar_url} displayName={member.display_name} />
            <div className="directory-card-body">
              <div className="directory-card-name">
                <strong>{member.display_name}</strong>
                <span className="directory-role-badge">{directoryRoleLabel(member.role_key)}{member.is_self ? " · 我" : ""}</span>
              </div>
              <div className="directory-card-meta">{member.occupation ?? "未填寫"}</div>
            </div>
            <span className="directory-chevron" aria-hidden="true">›</span>
          </Link>)}
        </div>}
    </section>
  </div>;
}

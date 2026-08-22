"use client";

import { useEffect, useState } from "react";
import {
  addressesWholeClub,
  audienceQueryString,
  emptyAudienceSelection,
  resolvedAudience,
  toggleId,
  type AudienceMode,
  type AudienceSelection,
} from "@/lib/audience/selection";
import styles from "./audience-picker.module.css";

export type AudienceTag = { tag_id: string; tag_name: string; member_count: number };
export type AudienceMember = { membership_id: string; display_name: string };

type Counts = { member_count: number; reachable_count: number } | null;

export function AudiencePicker({
  clubId,
  tags,
  members,
  initial = emptyAudienceSelection,
  showReach = false,
  onSelectionChange,
}: {
  clubId: string;
  tags: readonly AudienceTag[];
  members: readonly AudienceMember[];
  initial?: AudienceSelection;
  /** LINE pushes reach only paired members; other surfaces reach everyone. */
  showReach?: boolean;
  onSelectionChange?: (selection: AudienceSelection) => void;
}) {
  const [selection, setSelection] = useState<AudienceSelection>(initial);
  const [counts, setCounts] = useState<Counts>(null);
  const [failed, setFailed] = useState(false);

  const resolved = resolvedAudience(selection);
  const query = audienceQueryString(selection);

  useEffect(() => {
    onSelectionChange?.(selection);
  }, [selection, onSelectionChange]);

  useEffect(() => {
    // The count is a fact about the club that only the server can answer, so
    // it is fetched rather than derived from tag member_counts: two tags
    // overlap, and adding their counts would overstate the audience.
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/v1/clubs/${encodeURIComponent(clubId)}/audience?${query}`, {
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error("failed"))))
        .then((data) => { setCounts(data); setFailed(false); })
        .catch((error) => { if (error.name !== "AbortError") { setCounts(null); setFailed(true); } });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [clubId, query]);

  const setMode = (mode: AudienceMode) => setSelection((current) => ({ ...current, mode }));

  return <div className={styles.picker}>
    {/* Hidden inputs, so the picker works inside an ordinary server-action
        form without the surrounding page needing any client state. */}
    {resolved.tagIds.map((tagId) => <input key={tagId} type="hidden" name="audienceTagIds" value={tagId} />)}
    {resolved.membershipIds.map((id) => <input key={id} type="hidden" name="audienceMembershipIds" value={id} />)}

    <div className={styles.modes} role="radiogroup" aria-label="發送對象">
      {([
        ["everyone", "全社"],
        ["tags", "依標籤"],
        ["members", "指定社員"],
      ] as const).map(([mode, label]) => <label key={mode} className={styles.mode}>
        <input
          type="radio"
          name="audienceMode"
          value={mode}
          checked={selection.mode === mode}
          onChange={() => setMode(mode)}
        />
        <span>{label}</span>
      </label>)}
    </div>

    {selection.mode === "tags" && (tags.length === 0
      ? <p className={styles.hint}>這個扶輪社還沒有建立標籤。請先到社員頁建立。</p>
      : <div className="tag-picker">
          {tags.map((tag) => <label className="tag-option" key={tag.tag_id}>
            <input
              type="checkbox"
              checked={selection.tagIds.includes(tag.tag_id)}
              onChange={() => setSelection((current) => ({
                ...current,
                tagIds: toggleId(current.tagIds, tag.tag_id),
              }))}
            />
            <span>{tag.tag_name}（{tag.member_count}）</span>
          </label>)}
        </div>)}

    {selection.mode === "members" && (members.length === 0
      ? <p className={styles.hint}>這個扶輪社目前沒有可指定的社員。</p>
      : <div className="tag-picker">
          {members.map((member) => <label className="tag-option" key={member.membership_id}>
            <input
              type="checkbox"
              checked={selection.membershipIds.includes(member.membership_id)}
              onChange={() => setSelection((current) => ({
                ...current,
                membershipIds: toggleId(current.membershipIds, member.membership_id),
              }))}
            />
            <span>{member.display_name}</span>
          </label>)}
        </div>)}

    <p className={styles.summary} aria-live="polite">
      {failed
        ? "目前無法計算對象人數，送出前請再確認一次。"
        : counts === null
          ? "計算對象人數…"
          : showReach
            ? `${counts.member_count} 位社員，其中 ${counts.reachable_count} 位已加入 LINE 官方帳號、可收到推播。`
            : `${counts.member_count} 位社員`}
    </p>
    {showReach && counts !== null && counts.member_count > counts.reachable_count && <p className={styles.warning}>
      有 {counts.member_count - counts.reachable_count} 位尚未加入官方帳號，這則訊息不會送達他們。
    </p>}
    {addressesWholeClub(selection) && selection.mode !== "everyone" && <p className={styles.hint}>
      尚未選擇任何對象，目前等同於發給全社。
    </p>}
  </div>;
}

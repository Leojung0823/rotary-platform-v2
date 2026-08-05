"use client";

import { useMemo, useState } from "react";
import { manualCheckinAction } from "@/app/checkin-actions";

type Member = { membership_id: string; membership_number: string | null; display_name: string; checked_in: boolean };

export function ManualCheckinForm({ clubId, eventId, members }: { clubId: string; eventId: string; members: Member[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const available = useMemo(() => members.filter((member) => {
    const needle = query.trim().toLocaleLowerCase("zh-Hant");
    return !member.checked_in && (!needle || member.display_name.toLocaleLowerCase("zh-Hant").includes(needle) || member.membership_number?.toLocaleLowerCase("zh-Hant").includes(needle));
  }), [members, query]);

  return <form action={manualCheckinAction} className="form-stack">
    <input type="hidden" name="clubId" value={clubId} />
    <input type="hidden" name="eventId" value={eventId} />
    <input type="hidden" name="membershipId" value={selected} />
    <label className="field"><span className="label">搜尋社員姓名或社員編號</span><input className="input" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(""); }} /></label>
    <div className="member-picker" role="listbox" aria-label="選擇人工補登社員">
      {available.slice(0, 20).map((member) => <button key={member.membership_id} type="button" role="option" aria-selected={selected === member.membership_id} onClick={() => setSelected(member.membership_id)}>
        <strong>{member.display_name}</strong>{member.membership_number && <span>{member.membership_number}</span>}
      </button>)}
      {available.length === 0 && <p>找不到尚未簽到的社員。</p>}
    </div>
    <label className="field"><span className="label">補登原因</span><input className="input" name="reason" maxLength={500} required placeholder="例如：社員手機無法連線，現場已核對身分" /></label>
    <button className="button" type="submit" disabled={!selected}>確認人工補登</button>
  </form>;
}

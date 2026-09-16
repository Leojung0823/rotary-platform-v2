import { setMemberEventRegistrationAction } from "@/app/event-actions";
import {
  registrationResponseLabels,
  rosterSummary,
  type RegistrationRosterEntry,
} from "@/lib/events/registration-roster";

const respondedOn = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
});

function tone(response: RegistrationRosterEntry["response"]) {
  if (response === "attending") return "badge badge-success";
  if (response === "declined") return "badge badge-neutral";
  if (response === "pending") return "badge badge-warning";
  return "badge badge-danger";
}

/**
 * Who was invited, what each said, and a way to answer for them.
 *
 * Folded, because an officer opening the management page is usually there for
 * something else; the counts in the summary are what they came for, and the
 * list is what they open when chasing replies.
 */
export function EventRegistrationRoster({
  clubId,
  eventId,
  entries,
}: {
  clubId: string;
  eventId: string;
  entries: readonly RegistrationRosterEntry[] | null;
}) {
  if (entries === null) {
    return <div className="notice notice-error" role="alert">
      目前無法載入報名名單，系統不會把讀取失敗當成沒有人報名。
    </div>;
  }

  const summary = rosterSummary(entries);
  return <details className="roster-fold">
    <summary>
      報名名單（參加 {summary.attending} · 待回覆 {summary.awaiting} · 不參加 {summary.declined}）
    </summary>

    {entries.length === 0
      ? <p className="subtle">這場活動目前沒有可報名的社員。</p>
      : <div className="table-wrap">
        <table>
          <thead>
            <tr><th>社員</th><th>狀態</th><th>攜伴</th><th>備註</th><th>代為更新</th></tr>
          </thead>
          <tbody>
            {entries.map((entry) => <tr key={entry.membershipId}>
              <td><strong>{entry.displayName}</strong></td>
              <td>
                <span className={tone(entry.response)}>{registrationResponseLabels[entry.response]}</span>
                {entry.respondedAt && <><br /><small className="subtle">{respondedOn.format(new Date(entry.respondedAt))}</small></>}
              </td>
              <td>{entry.response === "attending" ? entry.guestCount : "—"}</td>
              <td>{entry.note || "—"}</td>
              <td>
                {/* One row, one form: the reason belongs to this change, and a
                    single shared box would attach one member's explanation to
                    whichever row was saved next. */}
                <form action={setMemberEventRegistrationAction} className="roster-action">
                  <input type="hidden" name="clubId" value={clubId} />
                  <input type="hidden" name="eventId" value={eventId} />
                  <input type="hidden" name="membershipId" value={entry.membershipId} />
                  <label className="sr-only" htmlFor={`response-${entry.membershipId}`}>回覆</label>
                  <select
                    className="input"
                    defaultValue={entry.response === "no_reply" ? "pending" : entry.response}
                    id={`response-${entry.membershipId}`}
                    name="response"
                  >
                    <option value="attending">參加</option>
                    <option value="declined">不參加</option>
                    <option value="pending">待確認</option>
                  </select>
                  <label className="sr-only" htmlFor={`guests-${entry.membershipId}`}>攜伴人數</label>
                  <input
                    className="input"
                    defaultValue={entry.guestCount}
                    id={`guests-${entry.membershipId}`}
                    inputMode="numeric"
                    max={20}
                    min={0}
                    name="guestCount"
                    type="number"
                  />
                  <label className="sr-only" htmlFor={`reason-${entry.membershipId}`}>原因</label>
                  <input
                    className="input"
                    id={`reason-${entry.membershipId}`}
                    maxLength={200}
                    name="reason"
                    placeholder="原因（必填，例如：來電告知）"
                    required
                  />
                  <button className="button button-secondary" type="submit">儲存</button>
                </form>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>}
  </details>;
}

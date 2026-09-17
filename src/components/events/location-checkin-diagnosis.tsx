import type { ClubEvent } from "@/lib/events/page-contract";
import { locationCheckinBlockers, type LocationCheckinBlocker } from "@/lib/checkin/location-blockers";

const blockerText: Record<LocationCheckinBlocker["reason"], string> = {
  no_venue: "這場沒有設定場地座標，只能掃 QR。請幹部在活動裡補上座標。",
  too_early: "還沒開放。定位簽到從活動開始前一小時才打開。",
  too_late: "已經過了。定位簽到到活動結束後一小時為止。",
  should_be_open: "座標和時間都符合，這場現在就能簽。如果這裡還是沒出現，請重新整理一次。",
};

/**
 * Why there is nothing to check into.
 *
 * The panel above says 「目前沒有開放定位簽到的活動」 and then lists the
 * conditions in the abstract. That is a sentence to read, not an answer: a
 * member standing at the venue has to work out which of six things is missing,
 * on a page that already knows the answer for every event in front of them.
 */
export function LocationCheckinDiagnosis({ events }: { events: readonly ClubEvent[] }) {
  const blockers = locationCheckinBlockers(events, new Date());
  if (blockers.length === 0) return null;

  return <section className="card" aria-labelledby="location-checkin-diagnosis-heading">
    <div className="section-heading">
      <div>
        <p className="eyebrow">為什麼這裡是空的</p>
        <h2 id="location-checkin-diagnosis-heading">最近的活動缺什麼</h2>
      </div>
    </div>
    <dl className="event-facts">
      {blockers.map((blocker) => <div key={blocker.eventId}>
        <dt>{blocker.title}</dt>
        <dd>{blockerText[blocker.reason]}</dd>
      </div>)}
    </dl>
  </section>;
}

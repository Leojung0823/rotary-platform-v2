import type { MemberClub } from "@/lib/member-experience";

export function ClubSwitcher({
  clubs,
  selectedClubId,
  label = "切換扶輪社",
}: {
  clubs: MemberClub[];
  selectedClubId: string;
  label?: string;
}) {
  if (clubs.length <= 1) return <p className="selected-club-name">{clubs[0]?.club_name}</p>;
  return <form method="get" className="club-switcher">
    <label className="field">
      <span className="sr-only">{label}</span>
      <select className="input" name="clubId" defaultValue={selectedClubId}>
        {clubs.map((club) => <option key={club.club_id} value={club.club_id}>{club.club_name}</option>)}
      </select>
    </label>
    <button className="button button-secondary" type="submit">切換</button>
  </form>;
}

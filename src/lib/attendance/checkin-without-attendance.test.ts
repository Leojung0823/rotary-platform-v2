import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { definedFunctionNames, latestDefinition, migrationDefining } from "./latest-definition";

/** Every RPC that decides whether a check-in may happen at all. */
const checkinGates = [
  "open_event_checkin",
  "rotate_event_checkin_token",
  "manual_check_in_event",
  "open_dynamic_event_checkin",
  // The static QR self check-in. It was missing from this list when the list
  // was written, so its own counts_for_attendance gate survived the migration
  // that removed every other one -- and the guard stayed green, because a list
  // that omits a case cannot fail on it. The completeness test below is the
  // fix for that shape of mistake, not another name added by hand.
  "check_in_to_event",
  "check_in_to_dynamic_event",
  "check_in_to_event_by_location",
  "list_my_location_checkin_events",
];

/** Every RPC that computes or reports the attendance rate. */
const attendanceRateReaders = [
  "attendance_result_for_member",
  "get_my_attendance_summary",
  "get_club_attendance_summary",
  "list_club_attendance_events",
];

describe("an event outside the attendance rate can still take check-ins", () => {
  // counts_for_attendance was carrying two meanings: "counts toward the rate"
  // and "check-in exists". A targeted board meeting had no way to record who
  // turned up. The column now means only the first.
  it.each(checkinGates)("%s does not ask whether the event counts", (name) => {
    expect(latestDefinition(name)).not.toContain("counts_for_attendance");
  });

  it.each(checkinGates)("%s still requires a published event", (name) => {
    expect(latestDefinition(name)).toMatch(/event_status (<>|=|in|not in)/u);
  });

  it("no longer reports a check-in as unavailable because of the rate", () => {
    expect(latestDefinition("get_my_member_home_projection"))
      .not.toContain("when not counts_for_attendance then 'not_available'");
  });
});

describe("no check-in path still asks whether the event counts", () => {
  // The generalisation. Naming the gates by hand is how check_in_to_event was
  // missed; this asks the question of every function that writes or opens a
  // check-in, whatever it is called.
  it("finds no counts_for_attendance left in any of them", () => {
    const offenders = definedFunctionNames()
      .filter((name) => /^(check_in_to|open_.*_checkin|rotate_event_checkin|manual_check_in|list_my_location_checkin)/u.test(name))
      .filter((name) => latestDefinition(name).includes("counts_for_attendance"));
    expect(offenders, "these still gate check-in on the attendance rate").toEqual([]);
  });

  it("checks a meaningful number of them", () => {
    const matched = definedFunctionNames()
      .filter((name) => /^(check_in_to|open_.*_checkin|rotate_event_checkin|manual_check_in|list_my_location_checkin)/u.test(name));
    expect(matched.length).toBeGreaterThanOrEqual(checkinGates.length);
  });
});

describe("the attendance rate is unchanged", () => {
  // The other half of the promise: "只是不計入出席率而已". Attendance rows now
  // exist for events outside the rate, so every reader of the rate has to keep
  // excluding them explicitly -- this is what fails if one is ever
  // "simplified" the way the check-in gates were.
  it.each(attendanceRateReaders)("%s still excludes events that do not count", (name) => {
    expect(latestDefinition(name)).toContain("counts_for_attendance");
  });

  it.each(attendanceRateReaders)("%s still counts regular meetings only", (name) => {
    expect(latestDefinition(name)).toContain("event_type = 'regular_meeting'");
  });

  it("is proven against a real database, not only by reading the SQL", () => {
    // String matching cannot tell whether the denominator actually moves.
    const manifest = readFileSync("scripts/database-verification-files.txt", "utf8");
    expect(manifest).toContain("supabase/verification/checkin_without_attendance.sql");
    const verification = readFileSync("supabase/verification/checkin_without_attendance.sql", "utf8");
    expect(verification).toContain("public.open_event_checkin");
    expect(verification).toContain("public.get_club_attendance_summary");
    expect(verification).toContain("entered the attendance denominator");
    expect(verification).toContain("check-in opened on a cancelled event");
  });
});

describe("the guards read the definition the database runs", () => {
  // Every name above is resolved through the migration history rather than a
  // filename, because the file that introduced a function stops describing it
  // the first time it is replaced.
  it.each([...checkinGates, ...attendanceRateReaders])("resolves %s to a migration", (name) => {
    expect(migrationDefining(name)).not.toBeNull();
  });

  it("resolves the check-in gates past the migration that introduced them", () => {
    // Pinned to a particular filename this said "the latest definition is
    // 20260915000700", which stops being true the moment anything touches
    // these functions again -- as the audience fix did. The claim worth
    // keeping is that the guards read something newer than where the function
    // was born, which is the mistake this whole file exists to avoid.
    const born: Record<string, string> = {
      open_event_checkin: "20260730000100_event_checkin_mvp.sql",
      check_in_to_event_by_location: "20260819000200_gps_checkin_v2.sql",
      check_in_to_dynamic_event: "20260812000100_dynamic_qr_checkin_v2.sql",
    };
    for (const [name, origin] of Object.entries(born)) {
      const current = migrationDefining(name);
      expect(current, `${name} is undefined`).not.toBeNull();
      expect(current!, `${name} still resolves to where it was introduced`).not.toBe(origin);
      expect(current! > origin, `${name} resolves to an older migration`).toBe(true);
    }
  });
});

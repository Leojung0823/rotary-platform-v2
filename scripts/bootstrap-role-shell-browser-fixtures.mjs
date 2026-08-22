import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { inspectBootstrapTarget } from "../src/lib/bootstrap-target.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = process.env.BOOTSTRAP_SUPERADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.E2E_ROLE_PASSWORD;

function fail(message) { throw new Error(`Role-shell browser fixture bootstrap failed: ${message}`); }
if (!url || !serviceRoleKey || !adminEmail || !password) fail("required environment variables are missing");
if (password.length < 12) fail("E2E_ROLE_PASSWORD must contain at least 12 characters");

const target = inspectBootstrapTarget(process.env);
if (!target.ok || target.target !== "local") fail("local Supabase is required");

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function authUserFor(email, displayName) {
  let found = null;
  for (let page = 1; !found; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) fail("could not inspect local Auth users");
    found = data.users.find((user) => user.email?.toLowerCase() === email) ?? null;
    if (data.users.length < 100) break;
  }
  if (!found) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (error || !data.user) fail("could not create local fixture Auth user");
    return data.user;
  }
  const { data, error } = await admin.auth.admin.updateUserById(found.id, {
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error || !data.user) fail("could not refresh local fixture Auth user");
  return data.user;
}

async function accountFor(email, displayName) {
  const user = await authUserFor(email, displayName);
  const existing = await admin.from("app_accounts")
    .select("id, person_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (existing.error) fail("could not inspect local fixture account");
  if (existing.data) return { ...existing.data, authUserId: user.id };

  const person = await admin.from("people")
    .insert({ canonical_name: displayName, primary_email: email })
    .select("id")
    .single();
  if (person.error || !person.data) fail("could not create local fixture person");
  const account = await admin.from("app_accounts")
    .insert({
      auth_user_id: user.id,
      person_id: person.data.id,
      login_email: email,
      account_display_name: displayName,
      account_status: "active",
    })
    .select("id, person_id")
    .single();
  if (account.error || !account.data) fail("could not create local fixture account");
  return { ...account.data, authUserId: user.id };
}

async function clubFor(id, code, name, createdBy) {
  const existing = await admin.from("clubs").select("id").eq("club_code", code).maybeSingle();
  if (existing.error) fail("could not inspect local fixture club");
  if (existing.data) return existing.data;
  const club = await admin.from("clubs")
    .insert({
      id,
      club_code: code,
      club_name: name,
      club_status: "active",
      activated_at: new Date().toISOString(),
      created_by_app_account_id: createdBy,
    })
    .select("id")
    .single();
  if (club.error || !club.data) fail("could not create local fixture club");
  return club.data;
}

async function addMembership({ clubId, account, status = "active", createdBy }) {
  const existing = await admin.from("club_memberships")
    .select("id")
    .eq("club_id", clubId)
    .eq("person_id", account.person_id)
    .maybeSingle();
  if (existing.error) fail("could not inspect local fixture membership");
  if (existing.data) {
    const update = await admin.from("club_memberships").update({ membership_status: status, ended_on: null }).eq("id", existing.data.id);
    if (update.error) fail("could not update local fixture membership");
    return;
  }
  const insert = await admin.from("club_memberships").insert({
    club_id: clubId,
    person_id: account.person_id,
    membership_status: status,
    created_by_app_account_id: createdBy,
  });
  if (insert.error) fail("could not create local fixture membership");
}

async function addOperator({ clubId, account, status = "active", createdBy }) {
  const existing = await admin.from("club_operator_permissions")
    .select("id")
    .eq("club_id", clubId)
    .eq("app_account_id", account.id)
    .maybeSingle();
  if (existing.error) fail("could not inspect local fixture operator");
  const values = status === "active"
    ? { assignment_status: "active", ends_at: null, revoked_at: null, revoked_by_app_account_id: null, revoke_reason: null }
    : {
      assignment_status: "revoked",
      // The database default for starts_at is evaluated at INSERT time. Make the
      // historical fixture start first so its revoked_at invariant holds.
      starts_at: new Date(Date.now() - 1_000).toISOString(),
      revoked_at: new Date().toISOString(),
      revoked_by_app_account_id: createdBy,
      revoke_reason: "local_browser_fixture",
    };
  if (existing.data) {
    const update = await admin.from("club_operator_permissions").update(values).eq("id", existing.data.id);
    if (update.error) fail("could not update local fixture operator");
    return;
  }
  const insert = await admin.from("club_operator_permissions").insert({
    club_id: clubId,
    app_account_id: account.id,
    permission_level: "club_manager",
    granted_by_app_account_id: createdBy,
    ...values,
  });
  if (insert.error) fail("could not create local fixture operator");
}

async function addPlatformRole({ account, createdBy }) {
  const existing = await admin.from("platform_roles")
    .select("id")
    .eq("app_account_id", account.id)
    .eq("role_key", "platform_admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (existing.error) fail("could not inspect local fixture platform role");
  if (existing.data) return;
  const insert = await admin.from("platform_roles").insert({
    app_account_id: account.id,
    role_key: "platform_admin",
    granted_by_app_account_id: createdBy,
  });
  if (insert.error) fail("could not create local fixture platform role");
}

async function addClubManagementRole({ clubId, account, createdBy }) {
  const existing = await admin.from("club_role_assignments")
    .select("id")
    .eq("club_id", clubId)
    .eq("app_account_id", account.id)
    .eq("role_key", "president")
    .eq("assignment_status", "active")
    .maybeSingle();
  if (existing.error) fail("could not inspect local fixture club role");
  if (existing.data) return;
  const insert = await admin.from("club_role_assignments").insert({
    club_id: clubId,
    app_account_id: account.id,
    role_key: "president",
    granted_by_app_account_id: createdBy,
  });
  if (insert.error) fail("could not create local fixture club role");
}

async function addMemberHomeEvents({ clubId, account }) {
  const currentEventId = "a1000000-0000-4000-8000-000000000101";
  const nextEventId = "a1000000-0000-4000-8000-000000000102";
  const checkinSessionId = "a1000000-0000-4000-8000-000000000103";
  const existing = await admin.from("club_events").select("id").in("id", [currentEventId, nextEventId]);
  if (existing.error) fail("could not inspect local member-home events");

  const now = Date.now();
  const existingIds = new Set(existing.data.map((event) => event.id));
  if (existingIds.size !== 2) {
    const events = [
      {
        id: currentEventId,
        club_id: clubId,
        event_type: "regular_meeting",
        title: "本機社員首頁例會",
        location: "本機測試會館",
        starts_at: new Date(now - 30 * 60_000).toISOString(),
        ends_at: new Date(now + 6 * 60 * 60_000).toISOString(),
        registration_deadline: new Date(now - 24 * 60 * 60_000).toISOString(),
        counts_for_attendance: true,
        event_status: "published",
        created_by_app_account_id: account.id,
        updated_by_app_account_id: account.id,
        published_at: new Date(now - 24 * 60 * 60_000).toISOString(),
      },
      {
        id: nextEventId,
        club_id: clubId,
        event_type: "service",
        title: "本機下一場服務活動",
        location: "本機河濱公園",
        starts_at: new Date(now + 2 * 24 * 60 * 60_000).toISOString(),
        ends_at: new Date(now + (2 * 24 + 2) * 60 * 60_000).toISOString(),
        registration_deadline: new Date(now + 24 * 60 * 60_000).toISOString(),
        counts_for_attendance: true,
        event_status: "published",
        created_by_app_account_id: account.id,
        updated_by_app_account_id: account.id,
        published_at: new Date(now - 24 * 60 * 60_000).toISOString(),
      },
    ].filter((event) => !existingIds.has(event.id));
    if (events.length > 0) {
      const insert = await admin.from("club_events").insert(events);
      if (insert.error) fail("could not create local member-home events");
    }
  }

  const session = await admin.from("event_checkin_sessions").select("id").eq("id", checkinSessionId).maybeSingle();
  if (session.error) fail("could not inspect local member-home check-in session");
  if (!session.data) {
    const insert = await admin.from("event_checkin_sessions").insert({
      id: checkinSessionId,
      club_id: clubId,
      event_id: currentEventId,
      token_hash: "a".repeat(64),
      token_prefix: "aaaaaaaa",
      session_status: "active",
      opens_at: new Date(now - 10 * 60_000).toISOString(),
      expires_at: new Date(now + 5 * 60 * 60_000).toISOString(),
      created_by_app_account_id: account.id,
    });
    if (insert.error) fail("could not create local member-home check-in session");
  }
}

async function addDynamicCheckinBrowserFixtures({ clubId, managerAccount }) {
  const managementEventId = "a1000000-0000-4000-8000-000000000104";
  const scanEventId = "a1000000-0000-4000-8000-000000000105";
  const scanSessionId = "a1000000-0000-4000-8000-000000000106";
  const scanCredential = "d".repeat(64);
  const now = Date.now();
  const events = [
    {
      id: managementEventId, club_id: clubId, event_type: "regular_meeting", title: "本機動態 QR 管理例會",
      location: "本機 QR 管理會館", starts_at: new Date(now - 10 * 60_000).toISOString(),
      ends_at: new Date(now + 2 * 60 * 60_000).toISOString(), registration_deadline: new Date(now - 60 * 60_000).toISOString(),
      counts_for_attendance: true, event_status: "published", created_by_app_account_id: managerAccount.id,
      updated_by_app_account_id: managerAccount.id, published_at: new Date(now - 24 * 60 * 60_000).toISOString(),
    },
    {
      id: scanEventId, club_id: clubId, event_type: "service", title: "本機動態 QR 掃描例會",
      location: "本機 QR 掃描會館", starts_at: new Date(now - 10 * 60_000).toISOString(),
      ends_at: new Date(now + 2 * 60 * 60_000).toISOString(), registration_deadline: new Date(now - 60 * 60_000).toISOString(),
      counts_for_attendance: true, event_status: "published", created_by_app_account_id: managerAccount.id,
      updated_by_app_account_id: managerAccount.id, published_at: new Date(now - 24 * 60 * 60_000).toISOString(),
    },
  ];
  const existingEvents = await admin.from("club_events").select("id").in("id", [managementEventId, scanEventId]);
  if (existingEvents.error) fail("could not inspect local dynamic QR events");
  const existingIds = new Set(existingEvents.data.map((event) => event.id));
  const insertEvents = events.filter((event) => !existingIds.has(event.id));
  if (insertEvents.length > 0) {
    const insert = await admin.from("club_events").insert(insertEvents);
    if (insert.error) fail("could not create local dynamic QR events");
  }

  const existingSession = await admin.from("event_checkin_sessions").select("id").eq("id", scanSessionId).maybeSingle();
  if (existingSession.error) fail("could not inspect local dynamic QR session");
  if (!existingSession.data) {
    const legacySecret = "c".repeat(64);
    const insert = await admin.from("event_checkin_sessions").insert({
      id: scanSessionId, club_id: clubId, event_id: scanEventId,
      token_hash: createHash("sha256").update(legacySecret).digest("hex"), token_prefix: legacySecret.slice(0, 8),
      session_status: "active", opens_at: new Date(now - 60_000).toISOString(),
      expires_at: new Date(now + 24 * 60 * 60_000).toISOString(), created_by_app_account_id: managerAccount.id,
    });
    if (insert.error) fail("could not create local dynamic QR session");
    const credential = await admin.from("event_checkin_qr_credentials").insert({
      club_id: clubId, event_id: scanEventId, checkin_session_id: scanSessionId,
      credential_hash: createHash("sha256").update(scanCredential).digest("hex"), credential_prefix: scanCredential.slice(0, 8),
      issued_at: new Date(now - 1_000).toISOString(), expires_at: new Date(now + 55_000).toISOString(), valid_until: new Date(now + 55_000).toISOString(),
    });
    if (credential.error) fail("could not create local dynamic QR credential");
  }
}

// Venue-anchored event with an open session, so the browser suite can drive a
// real location check-in with a mocked device position.
// The blessing wall only offers the "hide my amount" choice when the club has
// opted into public amounts, and that setting defaults to off -- so without
// this the browser test would assert against a club where the control is
// correctly absent.
//
// Done through an officer's own session rather than the service-role client:
// the settings table has a trigger that rejects any write it cannot attribute
// to an app account, which a service-role connection has no way to satisfy.
// A pledge with no blessing text, so the ledger on 我的 has something to show.
//
// Created through the member's own session rather than the browser: a local
// `next start` runs with NODE_ENV=production, and the blessing mutation guard
// refuses a non-https origin there, so the publish path cannot be exercised
// over plain http locally. The database-level verification covers that path;
// this fixture exists so the ledger UI can be.
// The LINE OA send form only exists once an account is configured, so without
// this the audience picker there has nothing to render into. Configured
// through an officer's session because configure_line_oa is a protected RPC;
// no secret is involved -- the channel secret and access token are read from
// server environment keys, never stored here.
async function configureLineOaFixture({ clubId, email }) {
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!publishableKey) fail("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required");

  const officer = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await officer.auth.signInWithPassword({ email, password });
  if (signIn.error) fail("LINE OA fixture sign-in did not succeed");

  const { error } = await officer.rpc("configure_line_oa", {
    p_club_id: clubId,
    p_display_name: "本機測試 OA",
    p_basic_id: "@e2e-rotary",
    p_channel_id: "0000000000",
  });
  if (error) fail("LINE OA fixture configuration did not succeed");
  await officer.auth.signOut();
}

async function addBlessingIouLedgerFixture({ clubId, email }) {
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!publishableKey) fail("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required");

  const member = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await member.auth.signInWithPassword({ email, password });
  if (signIn.error) fail("blessing ledger fixture sign-in did not succeed");

  // Asked through the member's own ledger RPC rather than a service-role
  // select: the entries table grants nothing to service_role by design, so a
  // direct read there fails rather than returning an empty list.
  const summary = await member.rpc("get_my_blessing_iou_summary", { p_club_id: clubId });
  if (summary.error) fail("blessing ledger fixture lookup did not succeed");

  // Entries are append-only by design, so only ever add the first one.
  if ((summary.data?.totals?.entry_count ?? 0) === 0) {
    const { error } = await member.rpc("create_blessing_iou_entry", {
      p_club_id: clubId,
      p_blessing_text: "",
      p_pledged_amount: 1234,
      p_hide_amount: true,
    });
    if (error) fail("blessing ledger fixture entry was not created");
  }

  await member.auth.signOut();
}

async function allowPublicBlessingAmounts({ clubId, email }) {
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!publishableKey) fail("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required");

  const officer = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await officer.auth.signInWithPassword({ email, password });
  if (signIn.error) fail("club officer sign-in did not succeed");

  const { error } = await officer.rpc("set_blessing_iou_amount_visibility", {
    p_club_id: clubId,
    p_allow_public_amounts: true,
  });
  if (error) fail("blessing IOU amount visibility RPC did not succeed");
  await officer.auth.signOut();
}

async function addLocationCheckinBrowserFixtures({ clubId, managerAccount }) {
  const now = Date.now();
  const eventTitle = "本機定位簽到例會";

  // Attendance is append-only by design, so a previously checked-in fixture
  // event can never be cleaned up. Instead retire the old session and stand up
  // a fresh event, which keeps exactly one venue event live per bootstrap.
  const previous = await admin.from("club_events").select("id").eq("club_id", clubId).eq("title", eventTitle);
  if (previous.error) fail("could not inspect local gps check-in events");
  const previousIds = previous.data.map((event) => event.id);
  if (previousIds.length > 0) {
    const close = await admin.from("event_checkin_sessions")
      .update({
        session_status: "closed",
        closed_at: new Date(now).toISOString(),
        close_reason: "local_fixture_reset",
      })
      .in("event_id", previousIds)
      .eq("session_status", "active");
    if (close.error) fail("could not retire previous local gps check-in sessions");
  }

  const event = await admin.from("club_events").insert({
    club_id: clubId, event_type: "regular_meeting", title: eventTitle,
    location: "本機定位會館",
    venue_latitude: 25.033964, venue_longitude: 121.564468,
    starts_at: new Date(now - 10 * 60_000).toISOString(),
    ends_at: new Date(now + 2 * 60 * 60_000).toISOString(),
    registration_deadline: new Date(now - 60 * 60_000).toISOString(),
    counts_for_attendance: true, event_status: "published",
    created_by_app_account_id: managerAccount.id, updated_by_app_account_id: managerAccount.id,
    published_at: new Date(now - 24 * 60 * 60_000).toISOString(),
  }).select("id").single();
  if (event.error || !event.data) fail("could not create local gps check-in event");

  const secret = createHash("sha256").update(`gps-${now}`).digest("hex");
  const session = await admin.from("event_checkin_sessions").insert({
    club_id: clubId, event_id: event.data.id,
    token_hash: createHash("sha256").update(secret).digest("hex"), token_prefix: secret.slice(0, 8),
    session_status: "active", opens_at: new Date(now - 60_000).toISOString(),
    expires_at: new Date(now + 24 * 60 * 60_000).toISOString(), created_by_app_account_id: managerAccount.id,
  });
  if (session.error) fail("could not create local gps check-in session");
}

const bootstrapAccount = await admin.from("app_accounts").select("id").eq("login_email_normalized", adminEmail).maybeSingle();
if (bootstrapAccount.error || !bootstrapAccount.data) fail("local superadmin account is missing");
const createdBy = bootstrapAccount.data.id;

const [memberClub, secondMemberClub, managedClub] = await Promise.all([
  clubFor("a1000000-0000-4000-8000-000000000001", "E2E-SHELL-MEMBER", "本機 Shell 社員社", createdBy),
  clubFor("a1000000-0000-4000-8000-000000000002", "E2E-SHELL-SECOND", "本機 Shell 第二社", createdBy),
  clubFor("a1000000-0000-4000-8000-000000000003", "E2E-SHELL-MANAGED", "本機 Shell 管理社", createdBy),
]);

const fixtures = Object.fromEntries(await Promise.all([
  ["ordinary", "e2e-shell-ordinary@example.test", "一般社員"],
  ["multi", "e2e-shell-multi@example.test", "多社社員"],
  ["memberManager", "e2e-shell-member-manager@example.test", "社員管理者"],
  ["management", "e2e-shell-management@example.test", "純社務管理者"],
  ["platform", "e2e-shell-platform@example.test", "純平台管理者"],
  ["platformMember", "e2e-shell-platform-member@example.test", "平台社員"],
  ["allModes", "e2e-shell-all-modes@example.test", "三模式使用者"],
  ["revoked", "e2e-shell-revoked@example.test", "已撤銷管理者"],
  ["suspended", "e2e-shell-suspended@example.test", "停權社員"],
].map(async ([key, email, displayName]) => [key, await accountFor(email, displayName)])));

await addMembership({ clubId: memberClub.id, account: fixtures.ordinary, createdBy });
await addMembership({ clubId: memberClub.id, account: fixtures.multi, createdBy });
await addMembership({ clubId: secondMemberClub.id, account: fixtures.multi, createdBy });
await addMembership({ clubId: memberClub.id, account: fixtures.memberManager, createdBy });
await addClubManagementRole({ clubId: memberClub.id, account: fixtures.memberManager, createdBy });
await addOperator({ clubId: managedClub.id, account: fixtures.management, createdBy });
// Genuinely manages two clubs (never a member of either) -- exercises the
// club switcher's "其他可管理扶輪社" grouping for a real multi-club operator.
await addOperator({ clubId: secondMemberClub.id, account: fixtures.management, createdBy });
await addPlatformRole({ account: fixtures.platform, createdBy });
await addMembership({ clubId: memberClub.id, account: fixtures.platformMember, createdBy });
await addPlatformRole({ account: fixtures.platformMember, createdBy });
await addMembership({ clubId: memberClub.id, account: fixtures.allModes, createdBy });
await addClubManagementRole({ clubId: memberClub.id, account: fixtures.allModes, createdBy });
await addPlatformRole({ account: fixtures.allModes, createdBy });
await addOperator({ clubId: managedClub.id, account: fixtures.revoked, status: "revoked", createdBy });
await addMembership({ clubId: memberClub.id, account: fixtures.suspended, status: "suspended", createdBy });
await addMemberHomeEvents({ clubId: memberClub.id, account: fixtures.ordinary });
await addDynamicCheckinBrowserFixtures({ clubId: memberClub.id, managerAccount: fixtures.memberManager });
await addLocationCheckinBrowserFixtures({ clubId: memberClub.id, managerAccount: fixtures.memberManager });
await allowPublicBlessingAmounts({
  clubId: memberClub.id,
  email: "e2e-shell-member-manager@example.test",
});
await configureLineOaFixture({
  clubId: memberClub.id,
  email: "e2e-shell-member-manager@example.test",
});
await addBlessingIouLedgerFixture({
  clubId: memberClub.id,
  email: "e2e-shell-ordinary@example.test",
});

console.log("Local role-shell and member-home browser fixtures are ready. No credentials were printed.");

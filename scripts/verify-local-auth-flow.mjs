import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = process.env.BOOTSTRAP_SUPERADMIN_EMAIL?.trim().toLowerCase();
const adminPassword = process.env.BOOTSTRAP_SUPERADMIN_PASSWORD;
const operatorPassword = process.env.VERIFY_OPERATOR_PASSWORD;
const mailpitUrl = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

function fail(message) { throw new Error(`Local auth verification failed: ${message}`); }
if (!url || !publishableKey || !serviceRoleKey || !adminEmail || !adminPassword || !operatorPassword) fail("required environment variables are missing");
if (!["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) fail("Supabase URL is not local");
if (operatorPassword.length < 12) fail("VERIFY_OPERATOR_PASSWORD must have at least 12 characters");

const suffix = randomUUID().slice(0, 8);
const operatorEmail = `verify-${suffix}@example.test`;
const clubCode = `VERIFY-${suffix}`.toUpperCase();
const user = createClient(url, publishableKey, { auth: { persistSession: false } });
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

let response = await user.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
if (response.error) fail("superadmin password login did not succeed");
const creation = await user.rpc("create_club_with_initial_operator_invitation", {
  p_club_code: clubCode,
  p_club_name: "本機 Auth 驗證扶輪社",
  p_operator_email: operatorEmail,
  p_operator_display_name: "本機驗證執行秘書",
  p_idempotency_key: `verify-auth-${suffix}`,
});
if (creation.error) fail("club provisioning RPC did not succeed");
response = await admin.auth.admin.inviteUserByEmail(operatorEmail, { redirectTo: "http://localhost:3000/invite/accept" });
if (response.error) fail("Supabase Auth invitation did not succeed");
const marked = await user.rpc("mark_operator_invitation_sent", { p_invite_id: creation.data.invite_id });
if (marked.error) fail("invitation could not be marked sent");

await new Promise((resolve) => setTimeout(resolve, 300));
const listing = await (await fetch(`${mailpitUrl}/api/v1/messages`)).json();
const summary = listing.messages?.find((message) => message.To?.some((recipient) => recipient.Address === operatorEmail));
if (!summary) fail("Mailpit did not receive the invitation");
const message = await (await fetch(`${mailpitUrl}/api/v1/message/${summary.ID}`)).json();
const html = String(message.HTML).replaceAll("&amp;", "&");
const linkMatch = html.match(/href="([^"]*token_hash=[^"]+)"/);
if (!linkMatch) fail("email does not use a server-side token hash link");
const link = new URL(linkMatch[1]);
const tokenHash = link.searchParams.get("token_hash");
if (message.Subject !== "扶輪平台執行秘書邀請" || link.origin !== "http://localhost:3000" || link.pathname !== "/auth/confirm" || !tokenHash) fail("email template safety contract did not match");

const operator = createClient(url, publishableKey, { auth: { persistSession: false } });
response = await operator.auth.verifyOtp({ token_hash: tokenHash, type: "invite" });
if (response.error) fail("Auth invite token could not be verified");
response = await operator.auth.updateUser({ password: operatorPassword });
if (response.error) fail("operator password could not be set");
const accepted = await operator.rpc("accept_operator_invitation", { p_invite_id: null });
if (accepted.error) fail("operator invitation RPC did not succeed");
const acceptedAgain = await operator.rpc("accept_operator_invitation", { p_invite_id: null });
if (acceptedAgain.error || !acceptedAgain.data.idempotent) fail("operator invitation acceptance was not idempotent");
await operator.auth.signOut();
response = await operator.auth.signInWithPassword({ email: operatorEmail, password: operatorPassword });
if (response.error) fail("operator password login did not succeed");
const clubs = await operator.rpc("list_manageable_clubs");
if (clubs.error || clubs.data.length !== 1 || clubs.data[0].club_code !== clubCode || clubs.data[0].club_id !== accepted.data.club_id) fail("operator tenant visibility did not match one invited club");

console.log("Local Mailpit invite, Auth acceptance, password login, idempotency, and tenant visibility passed. No tokens or credentials were printed.");

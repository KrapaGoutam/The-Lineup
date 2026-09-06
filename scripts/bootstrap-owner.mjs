#!/usr/bin/env node
// Creates the very first owner + organization + location + passcode for a
// freshly-migrated Supabase project. A plain script, not an HTTP route --
// see docs/features/015-hosted-supabase-persistence.md ("Bootstrap") for
// why. Refuses to run if ANY owner membership already exists anywhere in
// the database -- that guard is a query against real data, not a comment
// asking a human not to re-run it, so a second run (accidental or not)
// after a successful first one can never create a second owner or a
// backdoor. Further owners are promoted through the app's Team tab
// (Feature 014), which already enforces the same rule.
//
// Written as plain JS, not TypeScript, and does not import from src/lib --
// src/lib/passcode-security.ts and src/lib/supabase/admin.ts both start
// with `import "server-only"`, a Next.js build-time guard resolved through
// Next's own bundler (there is no real `server-only` package in
// node_modules to import outside of it). Rather than add a TS-script
// runner as a new dependency just to work around that, the one HMAC line
// and the one admin-client call are inlined below -- if either changes in
// src/lib, this must change with it.
//
// Usage:
//   node scripts/bootstrap-owner.mjs \
//     --org "The Monk's" --slug the-monks \
//     --location "Main" --timezone America/Chicago \
//     --owner-name "Your Name" [--passcode 1234] --yes
//
// Without --yes this is a dry run: prints what it would do, writes nothing.
// Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, and APP_PIN_PEPPER
// from .env.local (or the real environment) -- never a second copy of the
// organization's real passcode anywhere.

import { createHmac, randomInt, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PASSCODE_OUTPUT_FILE = ".bootstrap-owner-passcode.local.txt";

function loadEnvLocal() {
  const path = ".env.local";
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

function parseArgs(argv) {
  const out = { yes: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--yes") {
      out.yes = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      out[key] = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function required(name, value) {
  if (!value) fail(`Missing required --${name}`);
  return value;
}

const args = parseArgs(process.argv.slice(2));

const orgName = required("org", args.org);
const slug = required("slug", args.slug);
const locationName = required("location", args.location);
const timeZone = required("timezone", args.timezone);
const ownerName = required("owner-name", args.ownerName);
const generatedPasscode = String(randomInt(0, 10000)).padStart(4, "0");
const passcode = args.passcode ?? generatedPasscode;

if (!/^\d{4}$/.test(passcode)) fail("Passcode must be exactly 4 digits.");
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  fail(
    "Slug must be lowercase alphanumeric segments separated by single hyphens.",
  );
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const pepper = process.env.APP_PIN_PEPPER;

if (!supabaseUrl || !secretKey) {
  fail(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set (.env.local or the environment).",
  );
}
if (!pepper || pepper.length < 32) {
  fail(
    "APP_PIN_PEPPER must be set and at least 32 characters (.env.local or the environment).",
  );
}

// Mirrors src/lib/passcode-security.ts's createPasscodeLocator exactly.
function createPasscodeLocator(organizationId, code) {
  return createHmac("sha256", pepper)
    .update(`${organizationId}:${code}`)
    .digest("hex");
}

const admin = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`Target project:  ${supabaseUrl}`);
  console.log(`Organization:    ${orgName} (${slug})`);
  console.log(`Location:        ${locationName} · ${timeZone}`);
  console.log(`Owner:           ${ownerName}`);
  console.log(`Passcode source: ${args.passcode ? "provided" : "generated"}`);
  console.log("");

  // The guard: refuse if an owner already exists anywhere in this
  // database, full stop. This is what makes re-running the script inert,
  // not a warning comment.
  const { count, error: countError } = await admin
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .contains("roles", ["owner"]);
  if (countError) {
    fail(`Could not check for an existing owner: ${countError.message}`);
  }
  if ((count ?? 0) > 0) {
    fail(
      "Refusing to run: this database already has at least one owner membership. " +
        "Bootstrap only ever creates the first owner -- promote further owners " +
        "through the app's Team tab instead.",
    );
  }

  if (!args.yes) {
    console.log("Dry run (pass --yes to actually write). Nothing was created.");
    return;
  }

  const syntheticEmail = `${randomUUID()}@passcode.internal`;
  const { data: created, error: createUserError } =
    await admin.auth.admin.createUser({
      email: syntheticEmail,
      password: passcode,
      email_confirm: true,
    });
  if (createUserError || !created.user) {
    fail(`Could not create the owner's auth user: ${createUserError?.message}`);
  }
  const userId = created.user.id;
  const rollbackUser = () => admin.auth.admin.deleteUser(userId);

  const { error: profileError } = await admin
    .from("profiles")
    .insert({ id: userId, display_name: ownerName });
  if (profileError) {
    await rollbackUser();
    fail(`Could not create the profile: ${profileError.message}`);
  }

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: orgName, slug, created_by: userId })
    .select("id")
    .single();
  if (orgError || !org) {
    await rollbackUser();
    fail(`Could not create the organization: ${orgError?.message}`);
  }

  const { error: locationError } = await admin.from("locations").insert({
    organization_id: org.id,
    name: locationName,
    time_zone: timeZone,
  });
  if (locationError) {
    await rollbackUser();
    fail(`Could not create the location: ${locationError.message}`);
  }

  const { error: membershipError } = await admin.from("memberships").insert({
    organization_id: org.id,
    profile_id: userId,
    roles: ["owner"],
    active: true,
  });
  if (membershipError) {
    await rollbackUser();
    fail(`Could not create the owner membership: ${membershipError.message}`);
  }

  const locator = createPasscodeLocator(org.id, passcode);
  const { error: credentialError } = await admin
    .from("passcode_credentials")
    .insert({
      organization_id: org.id,
      profile_id: userId,
      locator,
      synthetic_email: syntheticEmail,
      active: true,
    });
  if (credentialError) {
    await rollbackUser();
    fail(
      `Could not create the passcode credential: ${credentialError.message}`,
    );
  }

  // The passcode goes to a local, gitignored file instead of stdout --
  // whoever runs this script may not be the same person reading its
  // terminal output (an agent invoking it on someone else's behalf, CI
  // logs, etc.), and the passcode is a real credential, not a log line.
  writeFileSync(
    PASSCODE_OUTPUT_FILE,
    `Restaurant URL: /r/${slug}\nOwner passcode: ${passcode}\n` +
      `Delete this file once you've noted the passcode -- it will not be regenerated.\n`,
  );
  console.log(
    `Done. Passcode written to ${PASSCODE_OUTPUT_FILE} (gitignored).`,
  );
  console.log("Open that file, note the passcode, then delete it.");
}

main().catch((error) => {
  fail(`Unexpected error: ${error?.message ?? error}`);
});

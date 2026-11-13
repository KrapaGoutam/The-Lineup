#!/usr/bin/env node
// V2-008 Batch B2-B4 planning kit CLI. READ-ONLY. There is no execute path.
//
//   node scripts/migration-compat/cli.mjs snapshot role|modules|attendance --url http://127.0.0.1:54321 --key-env LOCAL_SUPABASE_SERVICE_KEY --organization <uuid> [--location <uuid>]... [--environment] [--include-names] [--neon-export file.json] [--out snapshot.json]
//   node scripts/migration-compat/cli.mjs plan role|modules|attendance --snapshot snapshot.json [--manifest manifest.json] [--summary]
//
// Exit codes: 0 plan produced and nothing blocks it (APPLY / NOOP / READY_FOR_OWNER_APPROVAL / REPORT_ONLY),
//             1 the plan is refused or skipped (SKIP / REFUSED), 2 could not determine (bad input / read failed),
//             3 an execution flag was supplied (none exists here).
import fs from "node:fs";
import { pathToFileURL } from "node:url";

import { executionRequested } from "./common.mjs";
import { planAttendanceCompatibility } from "./attendance.mjs";
import { planModuleConfiguration } from "./module-config.mjs";
import { planOrganizationBackfill } from "./role-backfill.mjs";
import {
  readAttendanceSnapshot,
  readModuleSnapshot,
  readOrganizationSnapshot,
} from "./snapshot.mjs";

const PLANNERS = {
  role: planOrganizationBackfill,
  modules: planModuleConfiguration,
  attendance: planAttendanceCompatibility,
};
const OK_VERDICTS = new Set([
  "APPLY",
  "NOOP",
  "READY_FOR_OWNER_APPROVAL",
  "REPORT_ONLY",
]);

/**
 * @param {string[]} argv
 * @returns {any}
 */
export function parseArgs(argv) {
  const out = { _: [], location: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const [flag, inline] = a.slice(2).split("=");
    const boolean = ["summary", "environment", "include-names"].includes(flag);
    const value = boolean ? true : (inline ?? argv[(i += 1)]);
    if (flag === "location") out.location.push(value);
    else out[flag] = value;
  }
  return out;
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

/**
 * A plan reduced to counts and codes: safe to paste into an issue.
 * @param {any} plan
 * @returns {any}
 */
export function summarize(plan) {
  return {
    schema: plan.schema,
    verdict: plan.verdict,
    reasons: plan.reasons ?? [],
    counts: plan.counts ?? null,
  };
}

/**
 * @param {string[]} argv
 * @param {any} [io]
 * @returns {Promise<number>}
 */
export async function main(
  argv,
  {
    stdout = process.stdout,
    stderr = process.stderr,
    env = process.env,
    fetchImpl,
  } = {},
) {
  const forbidden = executionRequested(argv);
  if (forbidden.length) {
    stderr.write(
      `Refusing ${forbidden.join(", ")}: this package has no execution path. Applying anything is a separately authorized step (D-7).\n`,
    );
    return 3;
  }
  const args = parseArgs(argv);
  const [command, kind] = args._;
  try {
    if (command === "snapshot") {
      if (!["role", "modules", "attendance"].includes(kind))
        throw new Error("snapshot needs one of: role, modules, attendance");
      const key = env[args["key-env"] ?? "LOCAL_SUPABASE_SERVICE_KEY"];
      const common = {
        url: args.url ?? env.LOCAL_SUPABASE_URL,
        key,
        fetchImpl,
      };
      let snapshot;
      if (kind === "role")
        snapshot = await readOrganizationSnapshot({
          ...common,
          organizationId: args.organization,
        });
      else if (kind === "modules") {
        snapshot = await readModuleSnapshot({
          ...common,
          organizationId: args.organization,
          locationIds: args.location,
          scope: args.environment ? "environment" : "selected",
          includeNames: args["include-names"] === true,
        });
      } else {
        const neonUserIds = args["neon-export"]
          ? readJson(args["neon-export"])
          : null;
        snapshot = await readAttendanceSnapshot({
          ...common,
          organizationId: args.organization,
          neonUserIds,
        });
      }
      const text = `${JSON.stringify(snapshot, null, 2)}\n`;
      if (args.out) fs.writeFileSync(args.out, text);
      else stdout.write(text);
      return 0;
    }
    if (command === "plan") {
      const planner = PLANNERS[kind];
      if (!planner)
        throw new Error("plan needs one of: role, modules, attendance");
      if (!args.snapshot) throw new Error("--snapshot <file> is required");
      const plan = planner(
        readJson(args.snapshot),
        args.manifest ? readJson(args.manifest) : null,
      );
      stdout.write(
        `${JSON.stringify(args.summary ? summarize(plan) : plan, null, 2)}\n`,
      );
      return OK_VERDICTS.has(plan.verdict) ? 0 : 1;
    }
    throw new Error("usage: cli.mjs snapshot|plan role|modules|attendance ...");
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}

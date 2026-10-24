// Guard: non-production configuration (local DEV, CI, Vercel Preview/Development)
// must never reference the production Supabase project.
//
//   node scripts/check-nonprod-env.mjs                     # checks process.env
//   node scripts/check-nonprod-env.mjs --env-file .env.development.local
//   node scripts/check-nonprod-env.mjs --scan .next        # built output
//
// Reports variable / file NAMES only -- never values. Exit 1 on a violation.
// The hosted real-mode suites keep their own hard guards (tests/real/**);
// this adds the same rule to CI and to any env file or build you point it at.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEV_REF = "opmujepkemwcdxxorhfd";
export const PROD_REF = "ftadewtkjlaotfdvtjcv";

/**
 * @param {Record<string, string | undefined>} env
 * @returns {string[]} human-readable violations (no secret values)
 */
export function findEnvViolations(env) {
  const violations = [];
  for (const [name, value] of Object.entries(env)) {
    if (typeof value === "string" && value.includes(PROD_REF)) {
      violations.push(`${name} references the PRODUCTION Supabase ref`);
    }
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  if (url && !url.includes(DEV_REF) && !url.includes(PROD_REF)) {
    violations.push(
      "NEXT_PUBLIC_SUPABASE_URL is neither the DEV nor the PRODUCTION project",
    );
  }
  return violations;
}

export function parseEnvFile(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
}

/** @returns {string[]} relative file paths whose content contains the PROD ref */
export function scanDirectory(dir) {
  const hits = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (fs.readFileSync(full).includes(PROD_REF)) {
        hits.push(path.relative(dir, full));
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return hits;
}

function main(argv) {
  const arg = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const failures = [];

  const envFile = arg("--env-file");
  const env = envFile
    ? parseEnvFile(fs.readFileSync(envFile, "utf8"))
    : process.env;
  const source = envFile ? envFile : "process.env";
  for (const v of findEnvViolations(env)) failures.push(`${source}: ${v}`);

  const scan = arg("--scan");
  if (scan) {
    for (const file of scanDirectory(scan)) {
      failures.push(`${scan}/${file} contains the PRODUCTION Supabase ref`);
    }
  }

  if (failures.length > 0) {
    for (const f of failures) console.error(`::error::${f}`);
    return 1;
  }
  console.log(
    `non-production environment check passed (${source}${scan ? `, ${scan}` : ""})`,
  );
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}

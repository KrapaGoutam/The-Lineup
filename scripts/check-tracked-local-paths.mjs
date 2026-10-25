// Guard: local-only evidence must never be tracked in this public repo.
//
//   node scripts/check-tracked-local-paths.mjs
//
// Reports offending PATHS only -- never file contents. Exit 1 on a violation.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const FORBIDDEN = [
  /^docs\/testing\//,
  /^\.bootstrap-owner-passcode\.local\.txt$/,
  /\.code-workspace$/,
];

/** @param {string[]} paths tracked paths, forward-slash separated */
export function findForbiddenTracked(paths) {
  return paths.filter((p) => FORBIDDEN.some((re) => re.test(p)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  const bad = findForbiddenTracked(tracked);
  if (bad.length) {
    console.error(
      "Local-only paths are tracked (remove with git rm --cached):",
    );
    for (const p of bad) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log("check-tracked-local-paths: ok");
}

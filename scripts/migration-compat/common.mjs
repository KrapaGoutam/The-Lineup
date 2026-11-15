// V2-008 Batch B2-B4 planning kit: shared primitives. PURE and READ-ONLY.
//
// Nothing in scripts/migration-compat can write to a database: the planners are pure functions of
// a snapshot (plain JSON) and an optional owner manifest (plain JSON); the only network code is
// snapshot.mjs, which is GET-only and refuses every non-loopback host. There is deliberately NO
// execute path (see cli.mjs): applying anything is a separately authorized step (D-7).
import crypto from "node:crypto";

/** D-2 ladder: legacy organization role -> location role. Organization roles are NEVER replaced. */
export const LADDER = Object.freeze({
  owner: "manager",
  general_manager: "manager",
  shift_manager: "assistant_manager",
  host: "staff",
  server: "staff",
});

export const LEGACY_ROLES = Object.freeze(Object.keys(LADDER));

/** `public.location_role` ranks (staff < assistant_manager < manager). */
export const LOCATION_ROLE_RANK = Object.freeze({
  staff: 1,
  assistant_manager: 2,
  manager: 3,
});
export const LOCATION_ROLES = Object.freeze(Object.keys(LOCATION_ROLE_RANK));

/** `public.location_module_key`. `settings` is system-required and is NOT a member. */
export const MODULE_KEYS = Object.freeze([
  "table_allocation",
  "tasks",
  "schedule",
  "tips",
  "team",
  "attendance",
  "payroll",
  "bar_inventory",
  "recipes",
]);

/** `public.attendance_mode` (NULL = unconfigured; never a valid manifest value). */
export const ATTENDANCE_MODES = Object.freeze([
  "external",
  "internal_the_lineup",
  "disabled",
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === "string" && UUID.test(v);

/** `active = true AND archived_at IS NULL` - the repository-wide meaning of an active location. */
export const isActiveLocation = (l) =>
  l.active === true && (l.archivedAt ?? null) === null;

/** Deterministic JSON: object keys sorted, arrays kept in the order given. */
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
}

export const sha256 = (value) =>
  crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");

/** Stable ordering helper: compares string keys. */
export const byKey = (keyFn) => (a, b) => {
  const x = keyFn(a);
  const y = keyFn(b);
  return x < y ? -1 : x > y ? 1 : 0;
};

export const uniqueSorted = (values) => [...new Set(values)].sort();

/** Reject unknown keys so a typo or a shorthand ("all": true) can never be silently ignored. */
export function unknownKeys(object, allowed) {
  return Object.keys(object).filter((k) => !allowed.includes(k));
}

export const isPlainObject = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Argument guard shared by every CLI entry: this package has no write path, so any flag that
 * asks for one is refused loudly instead of being ignored.
 */
export const EXECUTION_FLAGS = Object.freeze([
  "--execute",
  "--apply",
  "--write",
  "--commit",
  "--force",
]);
export function executionRequested(argv) {
  return argv.filter((a) => {
    const name = a
      .split("=")[0]
      .toLowerCase()
      .replace(/^-{1,2}/, "");
    return EXECUTION_FLAGS.some((flag) => flag.slice(2) === name);
  });
}

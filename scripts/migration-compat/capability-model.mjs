// V2-008 Batch B2: a MODEL of the deployed *_profile_level functions for a ONE-active-location
// organization, used to show that the D-2 ladder preserves effective capability and that a
// PARTIAL backfill does not (the P0 fallback cliff).
//
// It is pinned to measured database output: supabase/tests/database/0081_b2_role_ladder_capability
// asserts the deployed functions return exactly the strings this model must return (see
// capability-model.test.ts). At two or more active locations the model deliberately returns
// null ("not measured"): the S1 measurements (security-s1/d2_role_ladder_equivalence_output.md)
// cover that case and the planner demands an explicit acknowledgement instead of guessing.

const LOCATION_LEVEL = Object.freeze({
  manager: 3,
  assistant_manager: 2,
  staff: 1,
});

/** Org-role level while the organization has at most one active location. */
const ORG_LEVEL_N1 = Object.freeze({
  owner: 4,
  general_manager: 3,
  shift_manager: 2,
  host: 1,
  server: 1,
});

/** Modules whose function is `greatest(location, organization, overall)`. */
const GREATEST_MODULES = Object.freeze(["attendance", "inventory", "payroll"]);

export const MODULE_ORDER = Object.freeze([
  "attendance",
  "inventory",
  "payroll",
  "schedule",
  "tasks",
  "tips",
]);

/**
 * Capability bands. No authorization threshold in the product distinguishes level 4 (owner) from
 * 3 (manager): a manager check is `>= 2` and access is `> 0`, so the band is what matters.
 */
export const band = (level) =>
  level >= 3
    ? "manager"
    : level === 2
      ? "assistant"
      : level === 1
        ? "staff"
        : "none";
const BAND_RANK = Object.freeze({
  none: 0,
  staff: 1,
  assistant: 2,
  manager: 3,
});
export const bandRank = (b) => BAND_RANK[b];

/**
 * Effective level per module for ONE member with exactly one legacy role.
 *
 * @param {string} legacyRole   owner | general_manager | shift_manager | host | server
 * @param {string|null} locationRole  the member's ACTIVE location row role at the location, or null
 * @param {{activeLocationCount:number, orgHasAnyLocationRow:boolean}} ctx
 *   orgHasAnyLocationRow = ANY location_memberships row (any status, any location) exists in the
 *   organization - the exact condition that removes the legacy fallback.
 * @returns {Record<string, number>|null} null when the organization is outside the measured domain
 */
export function levelsFor(legacyRole, locationRole, ctx) {
  if (ctx.activeLocationCount !== 1) return null;
  const orgLevel = ORG_LEVEL_N1[legacyRole];
  if (orgLevel === undefined) return null;
  const rowLevel = locationRole ? LOCATION_LEVEL[locationRole] : 0;
  if (locationRole && rowLevel === undefined) return null;
  const fallbackAllowed = !ctx.orgHasAnyLocationRow;
  const out = {};
  for (const moduleKey of MODULE_ORDER) {
    if (GREATEST_MODULES.includes(moduleKey)) {
      out[moduleKey] = Math.max(rowLevel, orgLevel);
    } else if (locationRole) {
      out[moduleKey] = rowLevel; // a location row OVERRIDES the organization role (coalesce)
    } else if (moduleKey === "schedule") {
      // owner / general_manager always fall back; everyone else only while no row exists at all
      out[moduleKey] =
        legacyRole === "owner" || legacyRole === "general_manager"
          ? orgLevel
          : fallbackAllowed
            ? orgLevel
            : 0;
    } else {
      // tasks / tips: the fallback exists only while the organization has no row at all
      out[moduleKey] = fallbackAllowed ? orgLevel : 0;
    }
  }
  return out;
}

/** att:inv:pay:sch:tas:tip - the exact string format pinned by pgTAP 0081. */
export const levelString = (levels) =>
  MODULE_ORDER.map((m) => levels[m]).join(":");

/**
 * Per-module band comparison of two level maps.
 * @returns {{module:string, before:string, after:string, change:'unchanged'|'expansion'|'reduction'}[]}
 */
export function compareBands(before, after) {
  return MODULE_ORDER.map((module) => {
    const b = band(before[module]);
    const a = band(after[module]);
    const change =
      bandRank(a) > bandRank(b)
        ? "expansion"
        : bandRank(a) < bandRank(b)
          ? "reduction"
          : "unchanged";
    return { module, before: b, after: a, change };
  });
}

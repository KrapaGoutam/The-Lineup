// V2-008 Batch B3: read-only, owner-decision-driven module configuration PLANNER. PURE.
//
// It never creates a module row. It answers: given the current location_module_configs rows and an
// explicit owner-approved manifest, what WOULD change, is anything missing or invalid, and would
// backend enforcement (V2-004.004, still STAGED - D-8) be activatable afterwards?
//
// Rules carried by tests: no blanket enablement; explicit existing settings preserved (the
// Monk's DEV disabled modules are never changed by default); `settings` is not an optional module;
// every nine keys decided for every active location; real/harness classification comes from the
// OWNER (name patterns are only a hint); archived locations get no rows.
import {
  MODULE_KEYS,
  byKey,
  isActiveLocation,
  isPlainObject,
  isUuid,
  sha256,
  uniqueSorted,
  unknownKeys,
} from "./common.mjs";

export const MODULE_SNAPSHOT_SCHEMA = "v2-008.module-snapshot/1";
export const MODULE_MANIFEST_SCHEMA = "v2-008.module-manifest/1";
export const LOCATION_CLASSES = Object.freeze(["real", "harness", "retired"]);

/** Advisory only. The owner's declared class always wins (D-4); a mismatch is reported. */
export const HARNESS_NAME_PATTERNS = Object.freeze([
  /^v2007-/i,
  /^v2-?00\d/i,
  /harness/i,
  /\binvrec\b/i,
  /^(rv|bb|e1|b2)[ -]/i,
  /\b(spec|fixture|synthetic|e2e|playwright)\b/i,
  /\btest\b/i,
]);

const SNAPSHOT_KEYS = [
  "schema",
  "capturedAt",
  "scope",
  "locations",
  "moduleConfigs",
];
const MANIFEST_KEYS = [
  "schema",
  "status",
  "approvedBy",
  "stateHash",
  "acknowledgeBlanketEnablement",
  "locations",
];
const LOCATION_DECISION_KEYS = [
  "locationId",
  "class",
  "modules",
  "overrideExisting",
  "acknowledgeHarnessEnablement",
];

/**
 * @param {any} snapshot
 * @returns {any[]}
 */
export function validateModuleSnapshot(snapshot) {
  const errors = [];
  const bad = (code, detail = {}) => errors.push({ code, ...detail });
  if (!isPlainObject(snapshot)) return [{ code: "snapshot_not_an_object" }];
  for (const k of unknownKeys(snapshot, SNAPSHOT_KEYS))
    bad("snapshot_unknown_key", { key: k });
  if (snapshot.schema !== MODULE_SNAPSHOT_SCHEMA)
    bad("snapshot_schema_mismatch");
  if (!["environment", "selected"].includes(snapshot.scope))
    bad("snapshot_scope_invalid");
  if (
    !Array.isArray(snapshot.locations) ||
    !Array.isArray(snapshot.moduleConfigs)
  ) {
    bad("snapshot_array_missing");
    return errors;
  }
  const ids = new Set();
  for (const l of snapshot.locations) {
    if (!isUuid(l.id) || !isUuid(l.organizationId)) bad("location_ids_invalid");
    if (ids.has(l.id)) bad("duplicate_location", { locationId: l.id });
    ids.add(l.id);
    if (typeof l.active !== "boolean")
      bad("location_active_invalid", { locationId: l.id });
  }
  const seen = new Set();
  for (const c of snapshot.moduleConfigs) {
    if (!ids.has(c.locationId))
      bad("config_location_not_selected", { locationId: c.locationId });
    if (!MODULE_KEYS.includes(c.moduleKey))
      bad("config_unknown_module", {
        locationId: c.locationId,
        moduleKey: c.moduleKey,
      });
    if (typeof c.isEnabled !== "boolean")
      bad("config_enabled_invalid", {
        locationId: c.locationId,
        moduleKey: c.moduleKey,
      });
    const key = `${c.locationId}|${c.moduleKey}`;
    if (seen.has(key))
      bad("duplicate_config", {
        locationId: c.locationId,
        moduleKey: c.moduleKey,
      });
    seen.add(key);
  }
  return errors;
}

/**
 * @param {any} snapshot
 * @returns {string}
 */
export function computeModuleStateHash(snapshot) {
  return sha256({
    scope: snapshot.scope,
    locations: [...snapshot.locations]
      .map((l) => ({
        id: l.id,
        organizationId: l.organizationId,
        active: l.active,
        archived: (l.archivedAt ?? null) !== null,
      }))
      .sort(byKey((l) => l.id)),
    moduleConfigs: [...snapshot.moduleConfigs]
      .map((c) => ({
        locationId: c.locationId,
        moduleKey: c.moduleKey,
        isEnabled: c.isEnabled,
      }))
      .sort(byKey((c) => `${c.locationId}|${c.moduleKey}`)),
  });
}

/**
 * @param {any} location
 * @returns {string}
 */
export const harnessHint = (location) => {
  const text =
    `${location.name ?? ""} ${location.organizationSlug ?? ""}`.trim();
  if (!text) return "unknown";
  return HARNESS_NAME_PATTERNS.some((re) => re.test(text))
    ? "harness-like"
    : "unknown";
};

/**
 * @param {any} snapshot  see MODULE_SNAPSHOT_SCHEMA
 * @param {any} [manifest]  see MODULE_MANIFEST_SCHEMA
 * @returns {any}
 */
export function planModuleConfiguration(snapshot, manifest = null) {
  const authorization = {
    dryRunOnly: true,
    executionAuthorized: false,
    enforcementActivation:
      "NOT AUTHORIZED (D-8): backend enforcement stays STAGED",
    note: "No module row is created or changed by this tool.",
  };
  const structural = validateModuleSnapshot(snapshot);
  if (structural.length) {
    return {
      schema: "v2-008.module-plan/1",
      verdict: "REFUSED",
      reasons: uniqueSorted(structural.map((e) => e.code)),
      blockers: structural,
      insertRows: null,
      authorization,
    };
  }

  const stateHash = computeModuleStateHash(snapshot);
  const blockers = [];
  const warnings = [];
  const block = (code, detail = {}) => blockers.push({ code, ...detail });
  const warn = (code, detail = {}) => warnings.push({ code, ...detail });

  const active = snapshot.locations
    .filter(isActiveLocation)
    .sort(byKey((l) => l.id));
  const existing = new Map(
    snapshot.moduleConfigs.map((c) => [
      `${c.locationId}|${c.moduleKey}`,
      c.isEnabled,
    ]),
  );

  // ---- manifest validation ------------------------------------------------------------
  let usable = null;
  const decisions = new Map();
  if (manifest !== null && manifest !== undefined) {
    const before = blockers.length;
    if (!isPlainObject(manifest)) block("manifest_not_an_object");
    else {
      for (const k of unknownKeys(manifest, MANIFEST_KEYS))
        block("manifest_unknown_key", { key: k });
      if (manifest.schema !== MODULE_MANIFEST_SCHEMA)
        block("manifest_schema_mismatch");
      if (manifest.status !== "approved") block("manifest_not_approved");
      if (
        typeof manifest.approvedBy !== "string" ||
        manifest.approvedBy.trim() === ""
      ) {
        block("manifest_incomplete", { field: "approvedBy" });
      }
      if (manifest.stateHash !== stateHash) block("manifest_state_drift");
      if (!Array.isArray(manifest.locations))
        block("manifest_incomplete", { field: "locations" });
      for (const d of Array.isArray(manifest.locations)
        ? manifest.locations
        : []) {
        if (!isPlainObject(d)) {
          block("manifest_decision_invalid");
          continue;
        }
        for (const k of unknownKeys(d, LOCATION_DECISION_KEYS))
          block("manifest_unknown_key", { key: k, locationId: d.locationId });
        if (decisions.has(d.locationId))
          block("manifest_duplicate_location", { locationId: d.locationId });
        decisions.set(d.locationId, d);
      }
    }
    if (blockers.length === before) usable = manifest;
  }

  // ---- per location report ------------------------------------------------------------------
  const locations = [];
  const insertRows = [];
  const overrides = [];
  // A decision for a location that is not in the snapshot is never silently ignored.
  for (const decidedId of decisions.keys()) {
    if (!snapshot.locations.some((l) => l.id === decidedId)) {
      block("manifest_location_unknown", { locationId: decidedId });
    }
  }
  for (const loc of snapshot.locations.slice().sort(byKey((l) => l.id))) {
    const isActive = isActiveLocation(loc);
    const rows = MODULE_KEYS.map((moduleKey) => {
      const current = existing.has(`${loc.id}|${moduleKey}`)
        ? existing.get(`${loc.id}|${moduleKey}`)
        : null;
      return { moduleKey, current, proposed: null, action: "none" };
    });
    const hint = harnessHint(loc);
    const decision = decisions.get(loc.id);
    const entry = {
      locationId: loc.id,
      organizationId: loc.organizationId,
      active: isActive,
      classification: { hint, declared: decision?.class ?? null },
      configuredBefore: rows.filter((r) => r.current !== null).length,
      complete: false,
      completeAfter: false,
      modules: rows,
    };
    entry.complete = entry.configuredBefore === MODULE_KEYS.length;

    if (!isActive) {
      if (decision)
        block("manifest_location_not_active", { locationId: loc.id });
      entry.completeAfter = entry.complete;
      locations.push(entry);
      continue;
    }
    if (usable && !decision) {
      block("location_decision_missing", { locationId: loc.id });
      entry.completeAfter = entry.complete;
      locations.push(entry);
      continue;
    }
    if (decision && usable) {
      if (!LOCATION_CLASSES.includes(decision.class))
        block("location_class_invalid", { locationId: loc.id });
      if (decision.class === "retired")
        block("class_retired_but_active", { locationId: loc.id });
      if (decision.class === "real" && hint === "harness-like")
        warn("declared_real_but_harness_like", { locationId: loc.id });
      if (decision.class === "harness" && hint === "unknown")
        warn("declared_harness_but_no_harness_hint", { locationId: loc.id });
      if (!isPlainObject(decision.modules)) {
        block("module_decisions_missing", { locationId: loc.id });
      } else {
        if ("settings" in decision.modules)
          block("settings_is_system_required", { locationId: loc.id });
        for (const k of Object.keys(decision.modules)) {
          if (k !== "settings" && !MODULE_KEYS.includes(k))
            block("module_key_unknown", { locationId: loc.id, moduleKey: k });
        }
        const override = new Set(decision.overrideExisting ?? []);
        for (const k of override) {
          if (!MODULE_KEYS.includes(k))
            block("override_key_unknown", { locationId: loc.id, moduleKey: k });
        }
        for (const row of rows) {
          const proposed = decision.modules[row.moduleKey];
          if (proposed === undefined) {
            block("module_decision_missing", {
              locationId: loc.id,
              moduleKey: row.moduleKey,
            });
            continue;
          }
          if (typeof proposed !== "boolean") {
            block("module_decision_invalid", {
              locationId: loc.id,
              moduleKey: row.moduleKey,
            });
            continue;
          }
          row.proposed = proposed;
          if (row.current === null) {
            row.action = "insert";
            insertRows.push({
              locationId: loc.id,
              moduleKey: row.moduleKey,
              isEnabled: proposed,
            });
          } else if (row.current === proposed) {
            row.action = "keep";
          } else if (override.has(row.moduleKey)) {
            row.action = "override";
            overrides.push({
              locationId: loc.id,
              moduleKey: row.moduleKey,
              from: row.current,
              to: proposed,
            });
          } else {
            // An EXPLICIT existing setting is never silently changed.
            row.action = "keep";
            block("existing_setting_would_change", {
              locationId: loc.id,
              moduleKey: row.moduleKey,
              existing: row.current,
              proposed,
            });
          }
        }
        if (
          (decision.class === "harness" || decision.class === "retired") &&
          rows.some((r) => r.proposed === true && r.action !== "keep") &&
          decision.acknowledgeHarnessEnablement !== true
        ) {
          block("harness_enablement_not_acknowledged", { locationId: loc.id });
        }
      }
    }
    entry.completeAfter = rows.every(
      (r) => r.current !== null || r.action === "insert",
    );
    locations.push(entry);
  }

  // ---- blanket enablement ------------------------------------------------------------------
  if (usable && active.length > 1) {
    const allOn = active.every((l) => {
      const d = decisions.get(l.id);
      return (
        d &&
        isPlainObject(d.modules) &&
        MODULE_KEYS.every((k) => d.modules[k] === true)
      );
    });
    if (allOn && usable.acknowledgeBlanketEnablement !== true)
      block("blanket_enablement_refused");
  }

  // ---- readiness for eventual enforcement activation -------------------------------------------
  const activeReport = locations.filter((l) => l.active);
  const readyBefore = activeReport.filter((l) => l.complete).length;
  const readyAfter = activeReport.filter((l) => l.completeAfter).length;
  const readiness = {
    scope: snapshot.scope,
    activeLocations: activeReport.length,
    completeBefore: readyBefore,
    completeAfter: readyAfter,
    // Enforcement readiness is an ENVIRONMENT property (every active location). A selection cannot prove it.
    enforcementReadyAfter:
      snapshot.scope === "environment" &&
      activeReport.length === readyAfter &&
      blockers.length === 0,
    enforcementActivation:
      "STAGED - activation requires D-8 and a green environment-wide readiness report",
  };

  // ---- verdict -------------------------------------------------------------------------------
  const reasons = uniqueSorted(blockers.map((b) => b.code));
  let verdict;
  if (manifest === null || manifest === undefined) verdict = "REPORT_ONLY";
  else if (blockers.length) verdict = "REFUSED";
  else if (insertRows.length === 0 && overrides.length === 0) verdict = "NOOP";
  else verdict = "READY_FOR_OWNER_APPROVAL";

  const decisionsRequired =
    verdict === "REPORT_ONLY"
      ? activeReport.map((l) => ({
          locationId: l.locationId,
          missingModules: l.modules
            .filter((m) => m.current === null)
            .map((m) => m.moduleKey),
          classificationHint: l.classification.hint,
        }))
      : null;

  return {
    schema: "v2-008.module-plan/1",
    stateHash,
    verdict,
    reasons,
    blockers: blockers.sort(
      byKey((b) => `${b.code}|${b.locationId ?? ""}|${b.moduleKey ?? ""}`),
    ),
    warnings,
    counts: {
      locations: snapshot.locations.length,
      activeLocations: activeReport.length,
      existingRows: snapshot.moduleConfigs.length,
      rowsToInsert:
        verdict === "REFUSED" || verdict === "REPORT_ONLY"
          ? 0
          : insertRows.length,
      overrides:
        verdict === "REFUSED" || verdict === "REPORT_ONLY"
          ? 0
          : overrides.length,
    },
    locations,
    decisionsRequired,
    insertRows:
      verdict === "READY_FOR_OWNER_APPROVAL"
        ? insertRows.sort(byKey((r) => `${r.locationId}|${r.moduleKey}`))
        : null,
    overrides: verdict === "READY_FOR_OWNER_APPROVAL" ? overrides : null,
    readiness,
    touches: {
      // Honest: true only when an approved plan would change an explicit existing setting.
      existingRows:
        verdict === "READY_FOR_OWNER_APPROVAL" && overrides.length > 0,
      memberships: false,
      locations: false,
      enforcementFlag: false,
    },
    authorization,
  };
}

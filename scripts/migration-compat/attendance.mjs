// V2-008 Batch B4: read-only Attendance compatibility planner and validator. PURE.
//
// It inspects each location's attendance_mode, validates external (Neon) identity links against
// the Supabase side ONLY, and turns an owner-approved manifest into a reviewable proposal.
// It never writes, never connects to Neon, never touches timesheets or historical attendance, and
// never changes the financial-consumption switch (finance stays OFF).
//
// Modes (public.attendance_mode): external, internal_the_lineup, disabled. NULL = unconfigured:
// the V2-006 contract fails closed for native clocking and reads as external-compatible; this tool
// NEVER guesses a mode for it - an owner-approved decision is required.
import {
  ATTENDANCE_MODES,
  byKey,
  isActiveLocation,
  isPlainObject,
  isUuid,
  sha256,
  uniqueSorted,
  unknownKeys,
} from "./common.mjs";

export const ATTENDANCE_SNAPSHOT_SCHEMA = "v2-008.attendance-snapshot/1";
export const ATTENDANCE_MANIFEST_SCHEMA = "v2-008.attendance-manifest/1";

const SNAPSHOT_KEYS = [
  "schema",
  "capturedAt",
  "locations",
  "memberships",
  "identityLinks",
  "neonUserIds",
  "financialActivationEnabled",
];
const MANIFEST_KEYS = [
  "schema",
  "status",
  "approvedBy",
  "stateHash",
  "locations",
];
const DECISION_KEYS = ["locationId", "mode", "acknowledgeTransitionConflict"];

/**
 * @param {any} snapshot
 * @returns {any[]}
 */
export function validateAttendanceSnapshot(snapshot) {
  const errors = [];
  const bad = (code, detail = {}) => errors.push({ code, ...detail });
  if (!isPlainObject(snapshot)) return [{ code: "snapshot_not_an_object" }];
  for (const k of unknownKeys(snapshot, SNAPSHOT_KEYS))
    bad("snapshot_unknown_key", { key: k });
  if (snapshot.schema !== ATTENDANCE_SNAPSHOT_SCHEMA)
    bad("snapshot_schema_mismatch");
  for (const key of ["locations", "memberships", "identityLinks"]) {
    if (!Array.isArray(snapshot[key])) bad("snapshot_array_missing", { key });
  }
  if (typeof snapshot.financialActivationEnabled !== "boolean")
    bad("financial_state_missing");
  if (
    snapshot.neonUserIds !== null &&
    snapshot.neonUserIds !== undefined &&
    !Array.isArray(snapshot.neonUserIds)
  ) {
    bad("neon_user_ids_invalid");
  }
  if (errors.length) return errors;
  const ids = new Set();
  for (const l of snapshot.locations) {
    if (!isUuid(l.id) || !isUuid(l.organizationId)) bad("location_ids_invalid");
    if (ids.has(l.id)) bad("duplicate_location", { locationId: l.id });
    ids.add(l.id);
    if (
      l.attendanceMode !== null &&
      !ATTENDANCE_MODES.includes(l.attendanceMode)
    ) {
      bad("attendance_mode_invalid", { locationId: l.id });
    }
  }
  return errors;
}

/**
 * @param {any} snapshot
 * @returns {string}
 */
export function computeAttendanceStateHash(snapshot) {
  return sha256({
    locations: [...snapshot.locations]
      .map((l) => ({
        id: l.id,
        organizationId: l.organizationId,
        active: l.active,
        archived: (l.archivedAt ?? null) !== null,
        mode: l.attendanceMode,
        native: l.nativeSessionCount ?? 0,
        open: l.openNativeSessionCount ?? 0,
      }))
      .sort(byKey((l) => l.id)),
    links: [...snapshot.identityLinks]
      .map((k) => ({ o: k.organizationId, p: k.profileId, n: k.neonUserId }))
      .sort(byKey((k) => `${k.o}|${k.p}|${k.n}`)),
    memberships: [...snapshot.memberships]
      .map((m) => ({ o: m.organizationId, p: m.profileId, a: m.active }))
      .sort(byKey((m) => `${m.o}|${m.p}`)),
    finance: snapshot.financialActivationEnabled,
  });
}

/**
 * Validates the Supabase side of the Supabase <-> Neon identity links. Neon itself is never read:
 * `neonUserIds` is an optional operator-supplied, READ-ONLY export of existing Neon user ids.
 * @param {any} snapshot
 * @returns {any}
 */
export function validateIdentityLinks(snapshot) {
  const findings = [];
  const f = (severity, code, detail = {}) =>
    findings.push({ severity, code, ...detail });
  const memberKey = (o, p) => `${o}|${p}`;
  const members = new Map(
    snapshot.memberships.map((m) => [
      memberKey(m.organizationId, m.profileId),
      m,
    ]),
  );
  const neon = Array.isArray(snapshot.neonUserIds)
    ? new Set(snapshot.neonUserIds)
    : null;
  const byOrgNeon = new Map();
  const byOrgProfile = new Map();
  const neonOrgs = new Map();
  for (const k of snapshot.identityLinks) {
    const where = { organizationId: k.organizationId, profileId: k.profileId };
    if (!Number.isInteger(k.neonUserId) || k.neonUserId <= 0)
      f("error", "invalid_neon_user_id", where);
    const member = members.get(memberKey(k.organizationId, k.profileId));
    if (!member) f("error", "link_without_membership", where);
    else if (!member.active) f("warning", "link_inactive_member", where);
    const a = `${k.organizationId}|${k.neonUserId}`;
    if (byOrgNeon.has(a))
      f("error", "duplicate_neon_user_id", {
        ...where,
        neonUserId: k.neonUserId,
      });
    byOrgNeon.set(a, true);
    const b = `${k.organizationId}|${k.profileId}`;
    if (byOrgProfile.has(b)) f("error", "duplicate_profile_link", where);
    byOrgProfile.set(b, true);
    const orgs = neonOrgs.get(k.neonUserId) ?? new Set();
    orgs.add(k.organizationId);
    neonOrgs.set(k.neonUserId, orgs);
    if (neon && !neon.has(k.neonUserId))
      f("error", "neon_user_not_in_supplied_export", {
        ...where,
        neonUserId: k.neonUserId,
      });
  }
  for (const [neonUserId, orgs] of neonOrgs) {
    if (orgs.size > 1)
      f("warning", "neon_user_linked_in_multiple_organizations", {
        neonUserId,
        organizations: [...orgs].sort(),
      });
  }
  return {
    neonVerification: neon
      ? "performed_against_supplied_export"
      : "not_performed",
    links: snapshot.identityLinks.length,
    findings: findings.sort(
      byKey(
        (x) =>
          `${x.severity}|${x.code}|${x.organizationId ?? ""}|${x.profileId ?? ""}`,
      ),
    ),
  };
}

/**
 * @param {any} snapshot  see ATTENDANCE_SNAPSHOT_SCHEMA
 * @param {any} [manifest]  see ATTENDANCE_MANIFEST_SCHEMA
 * @returns {any}
 */
export function planAttendanceCompatibility(snapshot, manifest = null) {
  const authorization = {
    dryRunOnly: true,
    executionAuthorized: false,
    financialConsumption: "OFF - never changed by this tool",
    neon: "never contacted",
    note: "Modes are changed only through the audited RPC public.set_location_attendance_mode, in a separately authorized step (D-6, D-7).",
  };
  const structural = validateAttendanceSnapshot(snapshot);
  if (structural.length) {
    return {
      schema: "v2-008.attendance-plan/1",
      verdict: "REFUSED",
      reasons: uniqueSorted(structural.map((e) => e.code)),
      blockers: structural,
      modeUpdates: null,
      authorization,
    };
  }

  const stateHash = computeAttendanceStateHash(snapshot);
  const blockers = [];
  const warnings = [];
  const block = (code, detail = {}) => blockers.push({ code, ...detail });
  const warn = (code, detail = {}) => warnings.push({ code, ...detail });

  if (snapshot.financialActivationEnabled !== false)
    block("financial_activation_not_off");

  const active = snapshot.locations
    .filter(isActiveLocation)
    .sort(byKey((l) => l.id));
  const linksByOrg = new Map();
  for (const k of snapshot.identityLinks)
    linksByOrg.set(
      k.organizationId,
      (linksByOrg.get(k.organizationId) ?? 0) + 1,
    );

  // ---- manifest -----------------------------------------------------------------------------
  const decisions = new Map();
  let usable = null;
  if (manifest !== null && manifest !== undefined) {
    const before = blockers.length;
    if (!isPlainObject(manifest)) block("manifest_not_an_object");
    else {
      for (const k of unknownKeys(manifest, MANIFEST_KEYS))
        block("manifest_unknown_key", { key: k });
      if (manifest.schema !== ATTENDANCE_MANIFEST_SCHEMA)
        block("manifest_schema_mismatch");
      if (manifest.status !== "approved") block("manifest_not_approved");
      if (
        typeof manifest.approvedBy !== "string" ||
        manifest.approvedBy.trim() === ""
      )
        block("manifest_incomplete", { field: "approvedBy" });
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
        for (const k of unknownKeys(d, DECISION_KEYS))
          block("manifest_unknown_key", { key: k, locationId: d.locationId });
        if (!ATTENDANCE_MODES.includes(d.mode))
          block("manifest_mode_invalid", { locationId: d.locationId });
        if (decisions.has(d.locationId))
          block("manifest_duplicate_location", { locationId: d.locationId });
        decisions.set(d.locationId, d);
      }
    }
    if (blockers.length === before) usable = manifest;
  }
  const locationById = new Map(snapshot.locations.map((l) => [l.id, l]));
  for (const id of decisions.keys()) {
    const loc = locationById.get(id);
    if (!loc) block("manifest_location_unknown", { locationId: id });
    else if (!isActiveLocation(loc))
      block("manifest_location_not_active", { locationId: id });
  }

  // ---- per location ------------------------------------------------------------------------------
  const locations = [];
  const modeUpdates = [];
  for (const loc of active) {
    const current = loc.attendanceMode ?? null;
    const links = linksByOrg.get(loc.organizationId) ?? 0;
    const native = loc.nativeSessionCount ?? 0;
    const open = loc.openNativeSessionCount ?? 0;
    const entry = {
      locationId: loc.id,
      organizationId: loc.organizationId,
      currentMode: current,
      state: current === null ? "unconfigured" : "configured_preserved",
      identityLinksInOrganization: links,
      nativeSessions: native,
      // Evidence only, never a decision: the legacy Monk's pattern (Neon links, no native history).
      evidence: {
        externalCompatible:
          (current === null || current === "external") &&
          links > 0 &&
          native === 0,
        nativeHistory: native > 0,
      },
      suggestion: null,
      decision: null,
      conflicts: [],
    };
    if (current === null && entry.evidence.externalCompatible) {
      entry.suggestion = {
        mode: "external",
        suggestionOnly: true,
        because: "identity links exist and no native attendance history",
      };
    }

    const decision = decisions.get(loc.id);
    if (usable && decision) {
      entry.decision = decision.mode;
      if (current === null) {
        if (decision.mode === "external" && links === 0) {
          block("external_mode_without_identity_links", { locationId: loc.id });
        }
        // NULL reads as external-compatible, so choosing native clocking while Neon links exist is
        // the same double-count risk as external -> internal: name it and require acknowledgement.
        if (decision.mode === "internal_the_lineup" && links > 0) {
          const conflicts = ["neon_links_would_double_count_with_native"];
          entry.conflicts = conflicts;
          if (decision.acknowledgeTransitionConflict !== true) {
            block("transition_requires_acknowledgement", {
              locationId: loc.id,
              from: null,
              to: decision.mode,
              conflicts,
            });
          } else {
            modeUpdates.push({
              locationId: loc.id,
              from: null,
              to: decision.mode,
              acknowledgedConflicts: conflicts,
            });
          }
        } else {
          modeUpdates.push({
            locationId: loc.id,
            from: null,
            to: decision.mode,
          });
        }
      } else if (decision.mode !== current) {
        // Changing a configured mode: internal and explicitly-disabled locations are PRESERVED unless
        // the owner names the exact transition and acknowledges every conflict.
        const conflicts = [];
        if (
          current === "internal_the_lineup" &&
          decision.mode === "external" &&
          native > 0
        )
          conflicts.push("native_history_would_be_orphaned");
        if (
          current === "external" &&
          decision.mode === "internal_the_lineup" &&
          links > 0
        )
          conflicts.push("neon_links_would_double_count_with_native");
        if (current === "disabled")
          conflicts.push("explicitly_disabled_location_reactivated");
        if (decision.mode === "disabled" && open > 0)
          conflicts.push("open_native_sessions_would_be_stranded");
        if (decision.mode === "external" && links === 0)
          conflicts.push("external_mode_without_identity_links");
        entry.conflicts = conflicts;
        if (decision.acknowledgeTransitionConflict !== true) {
          block("transition_requires_acknowledgement", {
            locationId: loc.id,
            from: current,
            to: decision.mode,
            conflicts,
          });
        } else {
          modeUpdates.push({
            locationId: loc.id,
            from: current,
            to: decision.mode,
            acknowledgedConflicts: conflicts,
          });
        }
      }
      // equal => preserved, nothing to do
    } else if (usable && current === null) {
      block("owner_approved_mode_absent", { locationId: loc.id });
    }
    locations.push(entry);
  }

  // ---- identity link validation ------------------------------------------------------------------
  const links = validateIdentityLinks(snapshot);
  const externalOrgs = new Set();
  for (const loc of active) {
    const final = decisions.get(loc.id)?.mode ?? loc.attendanceMode ?? null;
    if (usable && final === "external") externalOrgs.add(loc.organizationId);
    if (!usable && loc.attendanceMode === "external")
      externalOrgs.add(loc.organizationId);
  }
  for (const finding of links.findings) {
    if (
      finding.severity === "error" &&
      externalOrgs.has(finding.organizationId)
    ) {
      block(`identity_link_${finding.code}`, {
        organizationId: finding.organizationId,
        profileId: finding.profileId,
      });
    } else {
      warn(`identity_link_${finding.code}`, {
        organizationId: finding.organizationId,
        profileId: finding.profileId,
      });
    }
  }
  const linkedProfiles = new Set(
    snapshot.identityLinks.map((k) => `${k.organizationId}|${k.profileId}`),
  );
  for (const loc of active) {
    const final = decisions.get(loc.id)?.mode ?? loc.attendanceMode ?? null;
    if (final !== "external") continue;
    const missing = snapshot.memberships.filter(
      (m) =>
        m.organizationId === loc.organizationId &&
        m.active &&
        !linkedProfiles.has(`${m.organizationId}|${m.profileId}`),
    );
    if (missing.length)
      warn("external_members_without_identity_link", {
        locationId: loc.id,
        count: missing.length,
      });
  }

  // ---- verdict -------------------------------------------------------------------------------------------
  const unconfigured = locations
    .filter((l) => l.currentMode === null)
    .map((l) => l.locationId);
  let verdict;
  if (manifest === null || manifest === undefined) {
    verdict = blockers.length ? "REFUSED" : "REPORT_ONLY";
  } else if (blockers.length) verdict = "REFUSED";
  else if (modeUpdates.length === 0) verdict = "NOOP";
  else verdict = "READY_FOR_OWNER_APPROVAL";

  return {
    schema: "v2-008.attendance-plan/1",
    stateHash,
    verdict,
    reasons: uniqueSorted(blockers.map((b) => b.code)),
    blockers: blockers.sort(
      byKey(
        (b) =>
          `${b.code}|${b.locationId ?? ""}|${b.organizationId ?? ""}|${b.profileId ?? ""}`,
      ),
    ),
    warnings,
    counts: {
      activeLocations: active.length,
      unconfigured: unconfigured.length,
      configuredPreserved: locations.length - unconfigured.length,
      modeUpdates:
        verdict === "READY_FOR_OWNER_APPROVAL" ? modeUpdates.length : 0,
    },
    ownerDecisionRequiredFor:
      manifest === null || manifest === undefined
        ? unconfigured
        : unconfigured.filter((id) => !decisions.has(id)),
    locations,
    identityLinks: links,
    financialConsumption: "OFF",
    // The only way a mode ever changes: through the audited RPC, in a later authorized step.
    modeUpdates:
      verdict === "READY_FOR_OWNER_APPROVAL"
        ? modeUpdates.sort(byKey((u) => u.locationId))
        : null,
    touches: {
      timesheets: false,
      attendanceHistory: false,
      neon: false,
      financialSwitch: false,
      payroll: false,
    },
    authorization,
  };
}

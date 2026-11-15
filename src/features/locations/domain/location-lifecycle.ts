/**
 * V2-002.005 — Location Lifecycle Integrity
 *
 * Pure lifecycle rules for restaurant locations. No I/O, no framework imports:
 * the same module backs the server actions, the administration UI, the demo
 * source and the unit tests. The database (`public.transition_location_lifecycle`)
 * is the final authority; everything here mirrors it so the UI can explain and
 * pre-validate, never decide.
 *
 *   ACTIVE   : active = true  AND archived_at IS NULL
 *   INACTIVE : active = false AND archived_at IS NULL
 *   ARCHIVED : active = false AND archived_at IS NOT NULL
 */

export type LocationLifecycleStatus = "active" | "inactive" | "archived";

export type LocationLifecycleAction =
  | "deactivate"
  | "reactivate"
  | "archive"
  | "restore_archive";

export type LifecycleBlockerSeverity = "hard" | "warning";

/** Blocker categories reported by `get_location_lifecycle_readiness`. */
export type LifecycleBlockerCode =
  | "ACTIVE_SERVICE_SESSIONS"
  | "OPEN_SEATINGS"
  | "PLANNED_SERVICE_SESSIONS"
  | "OPEN_TASKS"
  | "ACTIVE_RECURRENCE_RULES"
  | "DRAFT_TIP_POOLS"
  | "PUBLISHED_FUTURE_SHIFTS"
  | "DRAFT_SCHEDULE_PERIODS"
  | "OPEN_ORDER_DRAFTS"
  | "STAGED_IMPORT_BATCHES";

export interface LifecycleBlocker {
  readonly code: LifecycleBlockerCode;
  /** Real, bounded count (capped at 1000 by the database). */
  readonly count: number;
  readonly capped: boolean;
  /** Severity when the action is `deactivate`. */
  readonly deactivate: LifecycleBlockerSeverity;
  /** Severity when the action is `archive`. */
  readonly archive: LifecycleBlockerSeverity;
}

/** Historical records that are retained (never blockers, never deleted). */
export interface LifecycleRetainedCounts {
  readonly locationAssignments: number;
  readonly closedServiceSessions: number;
  readonly shifts: number;
  readonly finalizedTipPools: number;
  readonly completedTasks: number;
  readonly inventoryAdjustments: number;
  readonly lifecycleEvents: number;
}

export interface LocationLifecycleReadiness {
  readonly locationId: string;
  readonly organizationId: string;
  readonly status: LocationLifecycleStatus;
  readonly canDeactivate: boolean;
  readonly canReactivate: boolean;
  readonly canArchive: boolean;
  readonly canRestoreArchive: boolean;
  readonly blockers: readonly LifecycleBlocker[];
  readonly retained: LifecycleRetainedCounts;
}

export interface LocationLifecycleEvent {
  readonly id: number;
  readonly locationId: string;
  readonly organizationId: string;
  readonly actorProfileId: string;
  readonly action: LocationLifecycleAction;
  readonly previousState: LocationLifecycleStatus;
  readonly newState: LocationLifecycleStatus;
  readonly reason: string;
  readonly changedAt: string;
}

export interface LifecycleValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export const LIFECYCLE_REASON_MIN_LENGTH = 3;
export const LIFECYCLE_REASON_MAX_LENGTH = 500;

export const LIFECYCLE_ACTIONS: readonly LocationLifecycleAction[] = [
  "deactivate",
  "reactivate",
  "archive",
  "restore_archive",
];

/**
 * Supported transitions. Archived locations can only return to INACTIVE
 * (restore) and never straight to ACTIVE: restoring a record and resuming
 * operations are deliberately separate, audited steps.
 */
export const LIFECYCLE_TRANSITIONS: Readonly<
  Record<
    LocationLifecycleAction,
    {
      readonly from: LocationLifecycleStatus;
      readonly to: LocationLifecycleStatus;
    }
  >
> = {
  deactivate: { from: "active", to: "inactive" },
  reactivate: { from: "inactive", to: "active" },
  archive: { from: "inactive", to: "archived" },
  restore_archive: { from: "archived", to: "inactive" },
};

const ACTION_LABELS: Readonly<Record<LocationLifecycleAction, string>> = {
  deactivate: "Deactivate",
  reactivate: "Reactivate",
  archive: "Archive",
  restore_archive: "Restore from archive",
};

const STATUS_LABELS: Readonly<Record<LocationLifecycleStatus, string>> = {
  active: "Active",
  inactive: "Inactive",
  archived: "Archived",
};

const BLOCKER_LABELS: Readonly<
  Record<LifecycleBlockerCode, readonly [singular: string, plural: string]>
> = {
  ACTIVE_SERVICE_SESSIONS: [
    "active service session",
    "active service sessions",
  ],
  OPEN_SEATINGS: ["open seating", "open seatings"],
  PLANNED_SERVICE_SESSIONS: [
    "planned service session",
    "planned service sessions",
  ],
  OPEN_TASKS: ["unresolved task", "unresolved tasks"],
  ACTIVE_RECURRENCE_RULES: [
    "active recurring task series",
    "active recurring task series",
  ],
  DRAFT_TIP_POOLS: ["draft tip pool", "draft tip pools"],
  PUBLISHED_FUTURE_SHIFTS: [
    "published future shift",
    "published future shifts",
  ],
  DRAFT_SCHEDULE_PERIODS: ["draft schedule period", "draft schedule periods"],
  OPEN_ORDER_DRAFTS: [
    "open inventory order draft",
    "open inventory order drafts",
  ],
  STAGED_IMPORT_BATCHES: [
    "staged inventory import",
    "staged inventory imports",
  ],
};

const RETAINED_LABELS: ReadonlyArray<
  readonly [keyof LifecycleRetainedCounts, string]
> = [
  ["locationAssignments", "staff assignments"],
  ["closedServiceSessions", "closed service sessions"],
  ["shifts", "shifts"],
  ["finalizedTipPools", "finalized tip pools"],
  ["completedTasks", "completed or cancelled tasks"],
  ["inventoryAdjustments", "inventory ledger entries"],
  ["lifecycleEvents", "lifecycle audit events"],
];

/** Maps the legacy `active` flag plus `archivedAt` to the lifecycle status. */
export function getLocationLifecycleStatus(location: {
  readonly active: boolean;
  readonly archivedAt?: string | null;
}): LocationLifecycleStatus {
  if (location.archivedAt) return "archived";
  return location.active ? "active" : "inactive";
}

/** Contradictory persisted states (active + archived) are never valid. */
export function isConsistentLifecycleState(location: {
  readonly active: boolean;
  readonly archivedAt?: string | null;
}): boolean {
  return !(location.active && location.archivedAt);
}

export function isLocationLifecycleStatus(
  value: unknown,
): value is LocationLifecycleStatus {
  return value === "active" || value === "inactive" || value === "archived";
}

export function isLocationLifecycleAction(
  value: unknown,
): value is LocationLifecycleAction {
  return (
    typeof value === "string" &&
    (LIFECYCLE_ACTIONS as readonly string[]).includes(value)
  );
}

export function describeLifecycleStatus(
  status: LocationLifecycleStatus,
): string {
  return STATUS_LABELS[status];
}

export function describeLifecycleAction(
  action: LocationLifecycleAction,
): string {
  return ACTION_LABELS[action];
}

/** Whether a location accepts new operational work (staff, sessions, tasks…). */
export function acceptsOperationalWork(
  status: LocationLifecycleStatus,
): boolean {
  return status === "active";
}

const AVAILABLE_ACTIONS: Readonly<
  Record<LocationLifecycleStatus, readonly LocationLifecycleAction[]>
> = {
  active: ["deactivate"],
  inactive: ["reactivate", "archive"],
  archived: ["restore_archive"],
};

/** Actions that may be offered for a status, in presentation order. */
export function getAvailableLifecycleActions(
  status: LocationLifecycleStatus,
): readonly LocationLifecycleAction[] {
  return AVAILABLE_ACTIONS[status];
}

export interface TransitionValidation {
  readonly valid: boolean;
  readonly nextStatus?: LocationLifecycleStatus;
  readonly error?: string;
}

/** Pure mirror of the database state machine. */
export function validateLifecycleTransition(
  current: LocationLifecycleStatus,
  action: LocationLifecycleAction,
): TransitionValidation {
  if (!isLocationLifecycleAction(action)) {
    return { valid: false, error: "Unknown lifecycle action." };
  }
  const rule = LIFECYCLE_TRANSITIONS[action];
  if (rule.from !== current) {
    if (current === "archived" && action === "reactivate") {
      return {
        valid: false,
        error:
          "An archived location cannot be reactivated directly. Restore it from the archive first.",
      };
    }
    return {
      valid: false,
      error: `Cannot ${describeLifecycleAction(action).toLowerCase()} a location that is ${current}.`,
    };
  }
  return { valid: true, nextStatus: rule.to };
}

/** Trims and validates a lifecycle reason (3–500 characters after trimming). */
export function validateLifecycleReason(reason: unknown): LifecycleValidation {
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return { valid: false, errors: ["A reason is required."] };
  }
  const length = reason.trim().length;
  if (length < LIFECYCLE_REASON_MIN_LENGTH) {
    return {
      valid: false,
      errors: [
        `The reason must be at least ${LIFECYCLE_REASON_MIN_LENGTH} characters.`,
      ],
    };
  }
  if (length > LIFECYCLE_REASON_MAX_LENGTH) {
    return {
      valid: false,
      errors: [
        `The reason must be at most ${LIFECYCLE_REASON_MAX_LENGTH} characters.`,
      ],
    };
  }
  return { valid: true, errors: [] };
}

/** Archive requires typing the exact location name (trimmed, case-sensitive). */
export function archiveConfirmationMatches(
  locationName: string,
  typed: string,
): boolean {
  const expected = locationName.trim();
  return expected.length > 0 && typed.trim() === expected;
}

/** Severity of a blocker for a given action (restore/reactivate never block). */
export function blockerSeverityFor(
  blocker: LifecycleBlocker,
  action: LocationLifecycleAction,
): LifecycleBlockerSeverity | null {
  if (action === "deactivate") return blocker.deactivate;
  if (action === "archive") return blocker.archive;
  return null;
}

export interface LifecycleEvaluation {
  readonly allowed: boolean;
  /** Present when the transition itself is not supported. */
  readonly transitionError?: string;
  readonly hardBlockers: readonly LifecycleBlocker[];
  readonly warnings: readonly LifecycleBlocker[];
}

/**
 * Evaluates whether `action` may proceed from the readiness snapshot. The
 * result is informational: the database re-checks inside the transition.
 */
export function evaluateLocationLifecycle(
  readiness: Pick<LocationLifecycleReadiness, "status" | "blockers">,
  action: LocationLifecycleAction,
): LifecycleEvaluation {
  const transition = validateLifecycleTransition(readiness.status, action);
  const relevant = readiness.blockers.filter((b) => b.count > 0);
  const hardBlockers = relevant.filter(
    (b) => blockerSeverityFor(b, action) === "hard",
  );
  const warnings = relevant.filter(
    (b) => blockerSeverityFor(b, action) === "warning",
  );
  return {
    allowed: transition.valid && hardBlockers.length === 0,
    transitionError: transition.valid ? undefined : transition.error,
    hardBlockers,
    warnings,
  };
}

function pluralize(blocker: LifecycleBlocker): string {
  const [singular, plural] = BLOCKER_LABELS[blocker.code] ?? [
    "unresolved item",
    "unresolved items",
  ];
  const noun = blocker.count === 1 ? singular : plural;
  const count = blocker.capped ? `${blocker.count}+` : String(blocker.count);
  return `${count} ${noun}`;
}

/** Human-readable lines built only from real counts, e.g. "2 unresolved tasks". */
export function formatLifecycleBlockers(
  blockers: readonly LifecycleBlocker[],
): string[] {
  return blockers.filter((b) => b.count > 0).map(pluralize);
}

/** Headline for a refused transition: "Cannot deactivate NASA." */
export function formatBlockedHeadline(
  locationName: string,
  action: LocationLifecycleAction,
): string {
  return `Cannot ${describeLifecycleAction(action).toLowerCase()} ${locationName}.`;
}

/** Retained historical data summary, only non-zero categories. */
export function formatRetainedSummary(
  retained: LifecycleRetainedCounts,
): string[] {
  return RETAINED_LABELS.filter(([key]) => retained[key] > 0).map(
    ([key, label]) => `${retained[key]} ${label}`,
  );
}

export const EMPTY_RETAINED_COUNTS: LifecycleRetainedCounts = {
  locationAssignments: 0,
  closedServiceSessions: 0,
  shifts: 0,
  finalizedTipPools: 0,
  completedTasks: 0,
  inventoryAdjustments: 0,
  lifecycleEvents: 0,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function asSeverity(value: unknown): LifecycleBlockerSeverity {
  // Fail closed: anything unrecognised is treated as a hard blocker.
  return value === "warning" ? "warning" : "hard";
}

/**
 * Defensive parser for the readiness JSON returned by the database. Returns
 * null for anything that is not a well-formed object so callers fail closed.
 */
export function parseLifecycleReadiness(
  raw: unknown,
): LocationLifecycleReadiness | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  if (
    typeof obj.locationId !== "string" ||
    typeof obj.organizationId !== "string"
  ) {
    return null;
  }
  if (!isLocationLifecycleStatus(obj.status)) return null;

  const blockers: LifecycleBlocker[] = [];
  if (Array.isArray(obj.blockers)) {
    for (const item of obj.blockers) {
      const b = asRecord(item);
      if (!b || typeof b.code !== "string") continue;
      const count = asCount(b.count);
      if (count <= 0) continue;
      blockers.push({
        code: b.code as LifecycleBlockerCode,
        count,
        capped: b.capped === true,
        deactivate: asSeverity(b.deactivate),
        archive: asSeverity(b.archive),
      });
    }
  }

  const ret = asRecord(obj.retained) ?? {};
  const retained: LifecycleRetainedCounts = {
    locationAssignments: asCount(ret.locationAssignments),
    closedServiceSessions: asCount(ret.closedServiceSessions),
    shifts: asCount(ret.shifts),
    finalizedTipPools: asCount(ret.finalizedTipPools),
    completedTasks: asCount(ret.completedTasks),
    inventoryAdjustments: asCount(ret.inventoryAdjustments),
    lifecycleEvents: asCount(ret.lifecycleEvents),
  };

  return {
    locationId: obj.locationId,
    organizationId: obj.organizationId,
    status: obj.status,
    canDeactivate: obj.canDeactivate === true,
    canReactivate: obj.canReactivate === true,
    canArchive: obj.canArchive === true,
    canRestoreArchive: obj.canRestoreArchive === true,
    blockers,
    retained,
  };
}

/**
 * Parses the JSON `detail` carried by a refused transition (SQLSTATE LC001).
 * Returns the hard blockers or an empty list when the detail is unusable.
 */
export function parseBlockedDetail(detail: unknown): LifecycleBlocker[] {
  if (typeof detail !== "string" || !detail.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(detail);
    if (!Array.isArray(parsed)) return [];
    const readiness = parseLifecycleReadiness({
      locationId: "-",
      organizationId: "-",
      status: "active",
      blockers: parsed,
    });
    return readiness ? [...readiness.blockers] : [];
  } catch {
    return [];
  }
}

/** SQLSTATEs raised by `public.transition_location_lifecycle`. */
export const LIFECYCLE_ERROR_CODES = {
  blocked: "LC001",
  invalidTransition: "LC002",
  stateConflict: "LC003",
  unauthorized: "42501",
  invalidInput: "22023",
  notFound: "P0002",
} as const;

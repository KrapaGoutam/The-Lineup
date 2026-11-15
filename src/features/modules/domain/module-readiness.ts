/**
 * V2-004.004 — Rollout readiness (pure, read-only).
 *
 * Backend enforcement may be activated in an environment only when EVERY
 * active location has an explicit configuration row for EVERY configurable
 * module (PLAN V2-004.001 §6.2). This evaluator is the TypeScript mirror of
 * the database function `private.module_enforcement_readiness()`, which is the
 * authoritative gate (the activation trigger calls it). It exists so the
 * operator report and the unit tests apply exactly the same rule.
 *
 * It NEVER proposes, fills or defaults a value: a missing key is reported, and
 * the owner decides what it should be.
 */

import {
  CONFIGURABLE_MODULE_KEYS,
  type ConfigurableModuleKey,
} from "./module-registry";

export interface ReadinessLocationInput {
  readonly organizationId: string;
  readonly locationId: string;
  readonly active: boolean;
  readonly archivedAt: string | null;
}

export interface ReadinessConfigInput {
  readonly locationId: string;
  readonly moduleKey: string;
}

export interface LocationReadiness {
  readonly organizationId: string;
  readonly locationId: string;
  readonly expectedKeys: readonly ConfigurableModuleKey[];
  readonly configuredKeys: readonly ConfigurableModuleKey[];
  readonly missingKeys: readonly ConfigurableModuleKey[];
  readonly ready: boolean;
}

export interface ReadinessReport {
  readonly activeLocations: number;
  readonly readyLocations: number;
  readonly notReadyLocations: number;
  readonly ready: boolean;
  readonly locations: readonly LocationReadiness[];
}

export function evaluateModuleReadiness(
  locations: readonly ReadinessLocationInput[],
  configs: readonly ReadinessConfigInput[],
): ReadinessReport {
  const expected = [...CONFIGURABLE_MODULE_KEYS].sort();
  const byLocation = new Map<string, Set<string>>();
  for (const config of configs) {
    const keys = byLocation.get(config.locationId) ?? new Set<string>();
    keys.add(config.moduleKey);
    byLocation.set(config.locationId, keys);
  }

  const rows: LocationReadiness[] = locations
    .filter((location) => location.active && location.archivedAt === null)
    .map((location) => {
      const present = byLocation.get(location.locationId) ?? new Set<string>();
      const configuredKeys = expected.filter((key) => present.has(key));
      const missingKeys = expected.filter((key) => !present.has(key));
      return {
        organizationId: location.organizationId,
        locationId: location.locationId,
        expectedKeys: expected,
        configuredKeys,
        missingKeys,
        ready: missingKeys.length === 0,
      };
    });

  const readyLocations = rows.filter((row) => row.ready).length;
  return {
    activeLocations: rows.length,
    readyLocations,
    notReadyLocations: rows.length - readyLocations,
    ready: rows.length === readyLocations,
    locations: rows,
  };
}

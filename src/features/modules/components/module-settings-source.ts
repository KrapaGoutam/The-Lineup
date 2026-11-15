import {
  loadModuleSettingsAction,
  saveModuleSettingsAction,
} from "../actions/module-config-actions";
import type { ModuleSettingsSource } from "../domain/module-settings";
import type { LocationModuleConfig } from "../domain/module-config";

export const liveModuleSettingsSource: ModuleSettingsSource = {
  read: loadModuleSettingsAction,
  save: saveModuleSettingsAction,
};
/** Owned by the administration session; no browser storage or hosted calls. */
export function createDemoModuleSettingsSource(): ModuleSettingsSource {
  const locations = new Map<string, Map<string, LocationModuleConfig>>();
  let revision = 0;
  return {
    async read(target) {
      return {
        ok: true,
        data: {
          actorId: "demo-admin",
          lifecycle: "active",
          configs: [...(locations.get(target.locationId)?.values() ?? [])],
        },
      };
    },
    async save(input) {
      const rows =
        locations.get(input.locationId) ??
        new Map<string, LocationModuleConfig>();
      const previous = rows.get(input.moduleKey);
      if ((previous?.updatedAt ?? null) !== input.expectedUpdatedAt)
        return { ok: false, code: "conflict" };
      const now = new Date(Date.UTC(2026, 0, 1) + ++revision).toISOString();
      const config: LocationModuleConfig = {
        locationId: input.locationId,
        moduleKey: input.moduleKey,
        isEnabled: input.isEnabled,
        metadata: {},
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
        updatedBy: "demo-admin",
      };
      rows.set(input.moduleKey, config);
      locations.set(input.locationId, rows);
      return { ok: true, data: config };
    },
  };
}

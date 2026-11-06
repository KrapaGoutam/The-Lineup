import type { LocationLifecycle, LocationModuleConfig } from "./module-config";
import type { ConfigurableModuleKey } from "./module-registry";

export interface ModuleEditorTarget {
  readonly locationId: string;
  readonly organizationId: string;
}
export interface ModuleSaveInput extends ModuleEditorTarget {
  readonly actorId: string;
  readonly moduleKey: ConfigurableModuleKey;
  readonly isEnabled: boolean;
  readonly expectedUpdatedAt: string | null;
}
export type SettingsFailure = {
  readonly ok: false;
  readonly code:
    | "unauthorized"
    | "location_unavailable"
    | "database_error"
    | "schema_missing"
    | "invalid_row"
    | "unexpected"
    | "invalid_input"
    | "archived"
    | "conflict"
    | "stale_identity";
};
export type SettingsResult<T> =
  | { readonly ok: true; readonly data: T }
  | SettingsFailure;
export interface ModuleEditorSnapshot {
  readonly actorId: string;
  readonly lifecycle: LocationLifecycle;
  readonly configs: readonly LocationModuleConfig[];
}
export interface ModuleSettingsSource {
  read(
    target: ModuleEditorTarget,
  ): Promise<SettingsResult<ModuleEditorSnapshot>>;
  save(input: ModuleSaveInput): Promise<SettingsResult<LocationModuleConfig>>;
}
export const MODULE_SETTINGS_ERRORS: Record<SettingsFailure["code"], string> = {
  unauthorized:
    "Management authority is required. Sign in with an authorized account.",
  location_unavailable: "Location unavailable or access denied.",
  database_error:
    "Module settings could not reach the database. Retry when available.",
  schema_missing: "Module settings are not installed in this environment.",
  invalid_row: "Stored module settings could not be validated.",
  unexpected:
    "An unexpected error prevented loading or saving module settings.",
  invalid_input: "The module setting is invalid.",
  archived:
    "Archived locations are read-only. Restore the location before editing.",
  conflict:
    "This setting changed in another session. Reload settings before choosing again.",
  stale_identity:
    "Your signed-in account changed. Reload settings before editing.",
};

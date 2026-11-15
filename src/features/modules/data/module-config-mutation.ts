import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import { verifyLocationAdminAuthority } from "@/features/locations/actions/location-admin-actions";
import { mapModuleConfigRow } from "../domain/module-config";
import { isConfigurableModuleKey } from "../domain/module-registry";
import type {
  ModuleEditorTarget,
  ModuleEditorSnapshot,
  ModuleSaveInput,
  SettingsResult,
  SettingsFailure,
} from "../domain/module-settings";
import type { LocationModuleConfig } from "../domain/module-config";
import { readLocationModuleConfigs } from "./module-config-reader";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validTarget(value: ModuleEditorTarget): boolean {
  return (
    !!value && uuid.test(value.locationId) && uuid.test(value.organizationId)
  );
}
function failure(code: SettingsFailure["code"]): SettingsFailure {
  return { ok: false, code };
}
function dbFailure(error: { code?: string }): SettingsFailure {
  if (["42P01", "PGRST205", "PGRST200"].includes(error.code ?? ""))
    return failure("schema_missing");
  if (["42501", "PGRST301", "PGRST302"].includes(error.code ?? ""))
    return failure("unauthorized");
  if (error.code === "55000") return failure("archived");
  if (error.code === "23505") return failure("conflict");
  return failure("database_error");
}

export async function loadModuleEditor(
  target: ModuleEditorTarget,
  client: SupabaseClient<Database>,
): Promise<SettingsResult<ModuleEditorSnapshot>> {
  try {
    const { data, error } = await client.auth.getUser();
    if (error?.name === "AuthRetryableFetchError")
      return failure("database_error");
    if (error || !data.user) return failure("unauthorized");
    if (!validTarget(target)) return failure("invalid_input");
    const location = await client
      .from("locations")
      .select("id, organization_id")
      .eq("id", target.locationId)
      .maybeSingle();
    if (location.error) return dbFailure(location.error);
    if (
      !location.data ||
      location.data.organization_id !== target.organizationId
    )
      return failure("location_unavailable");
    if (
      !(await verifyLocationAdminAuthority(
        data.user.id,
        location.data.organization_id,
        client,
      ))
    )
      return failure("unauthorized");
    const read = await readLocationModuleConfigs(target.locationId, client);
    if (read.status !== "ok")
      return failure(
        read.status === "error"
          ? read.code
          : read.status === "unavailable"
            ? read.reason
            : read.status,
      );
    return {
      ok: true,
      data: {
        actorId: data.user.id,
        lifecycle: read.lifecycle,
        configs: [...read.configs.values()],
      },
    };
  } catch {
    return failure("unexpected");
  }
}

/** No metadata input: preserve the validated informational envelope verbatim. */
export async function saveModuleConfig(
  input: ModuleSaveInput,
  client: SupabaseClient<Database>,
): Promise<SettingsResult<LocationModuleConfig>> {
  try {
    const loaded = await loadModuleEditor(input, client);
    if (!loaded.ok) return loaded;
    if (input.actorId !== loaded.data.actorId) return failure("stale_identity");
    if (
      !isConfigurableModuleKey(input.moduleKey) ||
      typeof input.isEnabled !== "boolean" ||
      !(
        input.expectedUpdatedAt === null ||
        typeof input.expectedUpdatedAt === "string"
      ) ||
      "metadata" in input
    )
      return failure("invalid_input");
    if (loaded.data.lifecycle === "archived") return failure("archived");
    const previous = loaded.data.configs.find(
      (c) => c.moduleKey === input.moduleKey,
    );
    if ((previous?.updatedAt ?? null) !== input.expectedUpdatedAt)
      return failure("conflict");
    const table = client.from("location_module_configs");
    // Conditional UPDATE is atomic. Concurrent first choices use INSERT + PK conflict.
    const query = previous
      ? table
          .update({ is_enabled: input.isEnabled })
          .eq("location_id", input.locationId)
          .eq("module_key", input.moduleKey)
          .eq("updated_at", input.expectedUpdatedAt!)
      : table.insert({
          location_id: input.locationId,
          module_key: input.moduleKey,
          is_enabled: input.isEnabled,
        });
    const written = await query.select().maybeSingle();
    if (written.error) return dbFailure(written.error);
    if (!written.data) return failure("conflict");
    const mapped = mapModuleConfigRow(written.data);
    if (mapped.kind !== "ok") return failure("invalid_row");
    return { ok: true, data: mapped.config };
  } catch {
    return failure("unexpected");
  }
}

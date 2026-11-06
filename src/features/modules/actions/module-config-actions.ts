"use server";
import { createClient } from "@/lib/supabase/server";
import {
  loadModuleEditor,
  saveModuleConfig,
} from "../data/module-config-mutation";
import type {
  ModuleEditorTarget,
  ModuleSaveInput,
} from "../domain/module-settings";

export async function loadModuleSettingsAction(target: ModuleEditorTarget) {
  try {
    return await loadModuleEditor(target, await createClient());
  } catch {
    return { ok: false as const, code: "unexpected" as const };
  }
}
export async function saveModuleSettingsAction(input: ModuleSaveInput) {
  try {
    return await saveModuleConfig(input, await createClient());
  } catch {
    return { ok: false as const, code: "unexpected" as const };
  }
}

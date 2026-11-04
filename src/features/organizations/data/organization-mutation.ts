import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import type {
  Organization,
  OrganizationBranding,
  OrganizationSettings,
} from "@/features/organizations/domain/organization";
import {
  isValidOrganizationName,
  isValidOrganizationSlug,
  mapOrganizationRow,
  mergeOrganizationSettings,
  normalizeOrganizationName,
  validateOrganizationSettings,
} from "@/features/organizations/domain/organization";
import { createClient } from "@/lib/supabase/server";

export interface ProvisionOrganizationParams {
  readonly name: string;
  readonly slug: string;
  readonly initialOwnerProfileId?: string | null;
  readonly settings?: OrganizationSettings;
  readonly branding?: OrganizationBranding;
}

export interface UpdateOrganizationParams {
  readonly organizationId: string;
  readonly name?: string;
  readonly branding?: OrganizationBranding;
  readonly settings?: Partial<OrganizationSettings>;
}

export type MutationResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: string; readonly code?: string };

/**
 * Server-authoritative mutation to provision a new organization and atomically bootstrap
 * its designated owner membership.
 * Enforces Overall Owner authorization, valid name and slug constraints, and atomic execution.
 */
export async function provisionNewOrganization(
  params: ProvisionOrganizationParams,
  client?: SupabaseClient<Database>,
): Promise<MutationResult<Organization>> {
  const name = normalizeOrganizationName(params.name);
  if (!isValidOrganizationName(name)) {
    return {
      success: false,
      error: "Organization name must be between 1 and 120 characters.",
      code: "INVALID_NAME",
    };
  }

  const rawSlug = typeof params.slug === "string" ? params.slug.trim() : "";
  if (!isValidOrganizationSlug(rawSlug)) {
    return {
      success: false,
      error:
        "Organization slug must consist of lowercase letters, numbers, and single hyphens.",
      code: "INVALID_SLUG",
    };
  }
  const slug = rawSlug;

  // Assemble and validate settings
  let finalSettings: OrganizationSettings = params.settings
    ? { ...params.settings }
    : {};
  if (params.branding) {
    finalSettings = mergeOrganizationSettings(finalSettings, {
      branding: params.branding,
    });
  }

  const settingsValidation = validateOrganizationSettings(finalSettings);
  if (!settingsValidation.valid) {
    return {
      success: false,
      error: settingsValidation.errors.join("; "),
      code: "INVALID_SETTINGS",
    };
  }

  try {
    const supabase = client ?? (await createClient());

    const { data, error } = await supabase.rpc("provision_organization", {
      p_name: name,
      p_slug: slug,
      p_initial_owner_profile_id: params.initialOwnerProfileId ?? null,
      p_settings: finalSettings,
    });

    if (error) {
      if (error.code === "23505") {
        return {
          success: false,
          error: "An organization with that slug already exists.",
          code: "DUPLICATE_SLUG",
        };
      }
      if (error.code === "42501") {
        return {
          success: false,
          error:
            "Unauthorized: only an Overall Owner may create new organizations.",
          code: "UNAUTHORIZED",
        };
      }
      if (error.code === "P0002") {
        return {
          success: false,
          error: "Designated initial owner profile does not exist.",
          code: "OWNER_NOT_FOUND",
        };
      }
      return {
        success: false,
        error: error.message || "Failed to provision organization.",
        code: error.code,
      };
    }

    if (!data) {
      return {
        success: false,
        error: "Failed to provision organization: no data returned.",
        code: "EMPTY_RESULT",
      };
    }

    return {
      success: true,
      data: mapOrganizationRow(data),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return {
      success: false,
      error: message,
      code: "INTERNAL_ERROR",
    };
  }
}

/**
 * Server-authoritative mutation to update an existing organization's metadata.
 * Only name, branding, and settings can be modified.
 * Organization ID, createdBy, and slug are strictly immutable.
 */
export async function updateOrganizationMetadata(
  params: UpdateOrganizationParams,
  client?: SupabaseClient<Database>,
): Promise<MutationResult<Organization>> {
  const { organizationId } = params;
  if (
    !organizationId ||
    typeof organizationId !== "string" ||
    !organizationId.trim()
  ) {
    return {
      success: false,
      error: "Organization ID is required.",
      code: "INVALID_ID",
    };
  }

  const updates: {
    name?: string;
    settings?: OrganizationSettings;
  } = {};

  if (params.name !== undefined) {
    const normalizedName = normalizeOrganizationName(params.name);
    if (!isValidOrganizationName(normalizedName)) {
      return {
        success: false,
        error: "Organization name must be between 1 and 120 characters.",
        code: "INVALID_NAME",
      };
    }
    updates.name = normalizedName;
  }

  try {
    const supabase = client ?? (await createClient());

    // Fetch existing settings if branding or settings patch is provided
    if (params.settings !== undefined || params.branding !== undefined) {
      const { data: existing, error: fetchError } = await supabase
        .from("organizations")
        .select("settings")
        .eq("id", organizationId.trim())
        .maybeSingle();

      if (fetchError || !existing) {
        return {
          success: false,
          error: "Organization not found or access denied.",
          code: "NOT_FOUND",
        };
      }

      const existingSettings =
        (existing.settings as unknown as OrganizationSettings) ?? {};
      let patch: Partial<OrganizationSettings> = params.settings
        ? { ...params.settings }
        : {};
      if (params.branding) {
        patch = { ...patch, branding: params.branding };
      }

      const merged = mergeOrganizationSettings(existingSettings, patch);
      const validation = validateOrganizationSettings(merged);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors.join("; "),
          code: "INVALID_SETTINGS",
        };
      }
      updates.settings = merged;
    }

    if (Object.keys(updates).length === 0) {
      return {
        success: false,
        error: "No metadata changes provided.",
        code: "NOOP",
      };
    }

    const { data: updated, error: updateError } = await supabase
      .from("organizations")
      .update(updates)
      .eq("id", organizationId.trim())
      .select("id, name, slug, created_by, settings, created_at, updated_at")
      .maybeSingle();

    if (updateError) {
      if (updateError.code === "42501") {
        return {
          success: false,
          error:
            "Unauthorized: caller lacks management role in this organization.",
          code: "UNAUTHORIZED",
        };
      }
      return {
        success: false,
        error: updateError.message || "Failed to update organization.",
        code: updateError.code,
      };
    }

    if (!updated) {
      return {
        success: false,
        error: "Organization not found or access denied.",
        code: "NOT_FOUND",
      };
    }

    return {
      success: true,
      data: mapOrganizationRow(updated),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return {
      success: false,
      error: message,
      code: "INTERNAL_ERROR",
    };
  }
}

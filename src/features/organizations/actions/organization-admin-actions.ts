"use server";

import { revalidatePath } from "next/cache";

import { getOverallRole } from "@/features/auth/data/overall-role";
import { listUserOrganizations } from "@/features/organizations/data/organization-reader";
import { provisionNewOrganization } from "@/features/organizations/data/organization-mutation";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";

type AdminResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string; readonly code?: string };

export interface OrganizationAdminRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly branchCount: number;
}

async function ownerSession() {
  const client = await createClient();
  const invalid = await requireLiveSession(client);
  if (invalid) return { client, allowed: false, signedIn: false };

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    return { client, allowed: false, signedIn: false };
  }
  const overallRole = await getOverallRole(data.user.id, client);
  return {
    client,
    allowed: overallRole === "owner",
    signedIn: true,
    profileId: data.user.id,
  };
}

export async function getSystemAdministrationAccessAction(): Promise<
  AdminResult<boolean>
> {
  try {
    const session = await ownerSession();
    if (!session.signedIn) {
      return {
        ok: false,
        error: "Please sign in to continue.",
        code: "UNAUTHENTICATED",
      };
    }
    return { ok: true, data: session.allowed };
  } catch {
    return { ok: false, error: "Unable to verify administration access." };
  }
}

export async function listOrganizationsForAdministrationAction(): Promise<
  AdminResult<readonly OrganizationAdminRow[]>
> {
  try {
    const session = await ownerSession();
    if (!session.allowed || !session.profileId) {
      return {
        ok: false,
        error: session.signedIn
          ? "Overall Owner authority is required."
          : "Please sign in to continue.",
        code: session.signedIn ? "FORBIDDEN" : "UNAUTHENTICATED",
      };
    }

    // The canonical reader applies the existing Overall-role and RLS rules.
    const organizations = await listUserOrganizations(
      session.profileId,
      session.client,
    );
    // The existing reader intentionally fails closed to [] on a read error.
    // Distinguish that case from a genuinely empty organization list here.
    const { count: totalOrganizations, error: listError } = await session.client
      .from("organizations")
      .select("id", { count: "exact", head: true });
    if (listError || totalOrganizations !== organizations.length) {
      throw new Error("Unable to load all organizations.");
    }
    const counts = await Promise.all(
      organizations.map(async (organization) => {
        const { count, error } = await session.client
          .from("locations")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organization.id);
        if (error || count === null) {
          throw new Error("Unable to load branch counts.");
        }
        return count;
      }),
    );

    return {
      ok: true,
      data: organizations.map((organization, index) => ({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        branchCount: counts[index],
      })),
    };
  } catch {
    return { ok: false, error: "Unable to load organizations. Please retry." };
  }
}

export async function createOrganizationAction(input: {
  readonly name: string;
  readonly slug: string;
}): Promise<AdminResult<{ id: string; name: string }>> {
  try {
    const session = await ownerSession();
    if (!session.allowed) {
      return {
        ok: false,
        error: session.signedIn
          ? "Only an Overall Owner may create organizations."
          : "Please sign in to continue.",
        code: session.signedIn ? "FORBIDDEN" : "UNAUTHENTICATED",
      };
    }

    const result = await provisionNewOrganization(
      { name: input.name, slug: input.slug },
      session.client,
    );
    if (!result.success) {
      return { ok: false, error: result.error, code: result.code };
    }
    revalidatePath("/system-administration/organizations");
    return {
      ok: true,
      data: { id: result.data.id, name: result.data.name },
    };
  } catch {
    return { ok: false, error: "Unable to create organization. Please retry." };
  }
}

import "server-only";

import type { createClient } from "@/lib/supabase/server";

// Matches the client `createClient()` actually returns (untyped against
// the generated Database schema, same as every other data-layer module
// in this app -- e.g. require-live-session.ts's identical local alias).
type TypedSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type AttendanceIdentityLink = {
  profileId: string;
  neonUserId: number;
  linkedBy: string;
  linkedAt: string;
};

export type IdentityLinkResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const UNAVAILABLE_ERROR = "Unable to reach attendance links right now.";

/**
 * Feature 019. The caller's own link, or null if they have none -- this
 * is what turns "signed in, not privileged" into either a scoped report
 * or the distinct unlinked state. RLS (`attendance_identity_links_select`)
 * already restricts a non-privileged caller to their own row regardless
 * of what's queried for, but the `.eq("profile_id", ...)` here is not
 * redundant with that: without it, a privileged caller's identical query
 * would get every row in the organization back, not just their own.
 */
export async function getOwnAttendanceLink(
  supabase: TypedSupabaseClient,
  input: { organizationId: string; profileId: string },
): Promise<IdentityLinkResult<AttendanceIdentityLink | null>> {
  const { data, error } = await supabase
    .from("attendance_identity_links")
    .select("profile_id, neon_user_id, linked_by, linked_at")
    .eq("organization_id", input.organizationId)
    .eq("profile_id", input.profileId)
    .maybeSingle();
  if (error) {
    console.error("getOwnAttendanceLink failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }
  if (!data) return { ok: true, data: null };
  return {
    ok: true,
    data: {
      profileId: data.profile_id,
      neonUserId: data.neon_user_id,
      linkedBy: data.linked_by,
      linkedAt: data.linked_at,
    },
  };
}

/**
 * Every link in the organization -- privileged-only (RLS enforces this
 * regardless; this is what the Team tab's link dialog uses to show each
 * person's current link, if any, and to refuse re-linking a Neon
 * identity someone else already holds before the database has to).
 */
export async function listAttendanceIdentityLinks(
  supabase: TypedSupabaseClient,
  input: { organizationId: string },
): Promise<IdentityLinkResult<AttendanceIdentityLink[]>> {
  const { data, error } = await supabase
    .from("attendance_identity_links")
    .select("profile_id, neon_user_id, linked_by, linked_at")
    .eq("organization_id", input.organizationId);
  if (error) {
    console.error("listAttendanceIdentityLinks failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }
  return {
    ok: true,
    data: data.map((row) => ({
      profileId: row.profile_id,
      neonUserId: row.neon_user_id,
      linkedBy: row.linked_by,
      linkedAt: row.linked_at,
    })),
  };
}

async function recordAuditEvent(
  supabase: TypedSupabaseClient,
  input: {
    organizationId: string;
    actorProfileId: string;
    action: "attendance_identity_linked" | "attendance_identity_unlinked";
    targetProfileId: string;
    beforeState: Record<string, unknown> | null;
    afterState: Record<string, unknown> | null;
  },
): Promise<IdentityLinkResult<null>> {
  const { error } = await supabase.from("audit_events").insert({
    organization_id: input.organizationId,
    actor_profile_id: input.actorProfileId,
    action: input.action,
    entity_type: "attendance_identity_link",
    entity_id: input.targetProfileId,
    before_state: input.beforeState,
    after_state: input.afterState,
  });
  if (error) {
    console.error("recordAttendanceIdentityLinkAuditEvent failed", error);
    return {
      ok: false,
      error: "Unable to record the attendance-link audit event.",
    };
  }
  return { ok: true, data: null };
}

/**
 * Create or replace the target's link (upsert on the table's own
 * `(organization_id, profile_id)` unique key). The
 * `(organization_id, neon_user_id)` unique key is the actual guard
 * against two people claiming the same Neon identity -- this surfaces
 * that as a clear message rather than a raw constraint-violation string,
 * but the constraint itself is what makes it impossible, not this check.
 */
export async function upsertAttendanceIdentityLink(
  supabase: TypedSupabaseClient,
  input: {
    organizationId: string;
    targetProfileId: string;
    neonUserId: number;
    actorProfileId: string;
  },
): Promise<IdentityLinkResult<null>> {
  const existing = await getOwnAttendanceLink(supabase, {
    organizationId: input.organizationId,
    profileId: input.targetProfileId,
  });
  if (!existing.ok) return existing;
  const beforeState = existing.data
    ? { neon_user_id: existing.data.neonUserId }
    : null;

  const { error } = await supabase.from("attendance_identity_links").upsert(
    {
      organization_id: input.organizationId,
      profile_id: input.targetProfileId,
      neon_user_id: input.neonUserId,
      linked_by: input.actorProfileId,
      linked_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,profile_id" },
  );
  if (error) {
    // Postgres unique_violation -- the target's neon_user_id is already
    // claimed by a different person in this organization.
    if (error.code === "23505") {
      return {
        ok: false,
        error:
          "That attendance record is already linked to a different person.",
      };
    }
    console.error("upsertAttendanceIdentityLink failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }

  const audit = await recordAuditEvent(supabase, {
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    action: "attendance_identity_linked",
    targetProfileId: input.targetProfileId,
    beforeState,
    afterState: { neon_user_id: input.neonUserId },
  });
  if (!audit.ok) {
    // Supabase's Data API does not expose a client-side transaction API.
    // Match the app's existing compensating-write pattern: restore the
    // exact prior link (or remove the newly-created one) so this action
    // never reports success for an unaudited personnel change.
    const rollback = existing.data
      ? await supabase.from("attendance_identity_links").upsert(
          {
            organization_id: input.organizationId,
            profile_id: input.targetProfileId,
            neon_user_id: existing.data.neonUserId,
            linked_by: existing.data.linkedBy,
            linked_at: existing.data.linkedAt,
          },
          { onConflict: "organization_id,profile_id" },
        )
      : await supabase
          .from("attendance_identity_links")
          .delete()
          .eq("organization_id", input.organizationId)
          .eq("profile_id", input.targetProfileId);
    if (rollback.error) {
      console.error(
        "upsertAttendanceIdentityLink rollback failed",
        rollback.error,
      );
    }
    return audit;
  }
  return { ok: true, data: null };
}

export async function removeAttendanceIdentityLink(
  supabase: TypedSupabaseClient,
  input: {
    organizationId: string;
    targetProfileId: string;
    actorProfileId: string;
  },
): Promise<IdentityLinkResult<null>> {
  const existing = await getOwnAttendanceLink(supabase, {
    organizationId: input.organizationId,
    profileId: input.targetProfileId,
  });
  if (!existing.ok) return existing;
  if (!existing.data) return { ok: true, data: null };

  const { error } = await supabase
    .from("attendance_identity_links")
    .delete()
    .eq("organization_id", input.organizationId)
    .eq("profile_id", input.targetProfileId);
  if (error) {
    console.error("removeAttendanceIdentityLink failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }

  const audit = await recordAuditEvent(supabase, {
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    action: "attendance_identity_unlinked",
    targetProfileId: input.targetProfileId,
    beforeState: { neon_user_id: existing.data.neonUserId },
    afterState: null,
  });
  if (!audit.ok) {
    const { error: rollbackError } = await supabase
      .from("attendance_identity_links")
      .insert({
        organization_id: input.organizationId,
        profile_id: input.targetProfileId,
        neon_user_id: existing.data.neonUserId,
        linked_by: existing.data.linkedBy,
        linked_at: existing.data.linkedAt,
      });
    if (rollbackError) {
      console.error(
        "removeAttendanceIdentityLink rollback failed",
        rollbackError,
      );
    }
    return audit;
  }
  return { ok: true, data: null };
}

import "server-only";

/**
 * Feature 024. A thin wrapper around inserting into the existing,
 * already-RLS-protected `audit_events` table (Tip Split's finalize/reopen
 * trail already writes here -- see `src/features/tips/data/tips-data.ts`;
 * this is not a new table). Deliberately structurally typed rather than
 * pinned to `TypedSupabaseClient` (the regular, cookie-bound client) so
 * the same helper works from both a Server Action's RLS-bound client
 * (`updateTeamDesignationAction`, `renameTeamMemberAction`) and the
 * passcode-reset route's admin client (`createAdminClient`), which are
 * two different concrete return types.
 *
 * An audit-write failure must never fail or roll back the action that
 * already succeeded -- the rename/reset/designation-change is real either
 * way, so this only logs and swallows its own error.
 */
type AuditEventsClient = {
  from(table: "audit_events"): {
    insert(row: {
      organization_id: string;
      location_id?: string | null;
      actor_profile_id: string;
      action: string;
      entity_type: string;
      entity_id?: string | null;
      before_state?: Record<string, unknown> | null;
      after_state?: Record<string, unknown> | null;
      reason?: string | null;
    }): PromiseLike<{ error: { message: string } | null }>;
  };
};

export type AuditEventInput = {
  organizationId: string;
  actorProfileId: string;
  action: string;
  entityType: string;
  entityId?: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  reason?: string | null;
};

export async function writeAuditEvent(
  supabase: AuditEventsClient,
  input: AuditEventInput,
): Promise<void> {
  try {
    const { error } = await supabase.from("audit_events").insert({
      organization_id: input.organizationId,
      actor_profile_id: input.actorProfileId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      before_state: input.beforeState ?? null,
      after_state: input.afterState ?? null,
      reason: input.reason ?? null,
    });
    if (error) {
      console.error(
        "Failed to write audit event:",
        input.action,
        error.message,
      );
    }
  } catch (err) {
    console.error("Failed to write audit event:", input.action, err);
  }
}

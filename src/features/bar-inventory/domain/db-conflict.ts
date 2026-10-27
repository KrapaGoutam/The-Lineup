import type { CatalogConflict } from "./inventory-types";

export type RpcError = {
  message?: string;
  code?: string;
  details?: string | null;
};

/** PT409 stale and 23505 duplicate carry a JSON `details` the UI can act on. */
export function conflictFrom(error: RpcError): CatalogConflict | undefined {
  if ((error.code !== "PT409" && error.code !== "23505") || !error.details) {
    return undefined;
  }
  try {
    const detail = JSON.parse(error.details) as Record<string, unknown>;
    if (detail.kind === "stale") {
      return {
        kind: "stale",
        entity: String(detail.entity ?? ""),
        id: String(detail.id ?? ""),
        currentVersion: Number(detail.current_version ?? 0),
        updatedBy:
          typeof detail.updated_by === "string" ? detail.updated_by : null,
        updatedAt:
          typeof detail.updated_at === "string" ? detail.updated_at : null,
        current:
          typeof detail.on_hand === "number" &&
          typeof detail.backup === "number"
            ? { onHand: detail.on_hand, backup: detail.backup }
            : undefined,
      };
    }
    if (detail.kind === "duplicate") {
      return {
        kind: "duplicate",
        entity: String(detail.entity ?? ""),
        field: String(detail.field ?? ""),
        existingId:
          typeof detail.existing_id === "string" ? detail.existing_id : null,
        existingLabel:
          typeof detail.existing_label === "string"
            ? detail.existing_label
            : null,
      };
    }
  } catch {
    // Not JSON: fall through to the plain message.
  }
  return undefined;
}

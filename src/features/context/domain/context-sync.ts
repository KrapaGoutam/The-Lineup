/**
 * V2-003.005 — cross-tab notification contract.
 *
 * A message tells another tab "something about the shared context may have
 * changed, go and ask the server". It deliberately carries NO organization,
 * location, profile, role, token or cookie value: there is nothing in it a
 * receiver could copy into state, and nothing an attacker-controlled message
 * could make a receiver trust. It is a UX signal, never an authorization.
 */

export const CONTEXT_SYNC_CHANNEL = "lineup:active-context:v1";

export const CONTEXT_SYNC_EVENT_TYPES = [
  "context_changed",
  "context_cleared",
  "session_changed",
  "signed_out",
] as const;
export type ContextSyncEventType = (typeof CONTEXT_SYNC_EVENT_TYPES)[number];

export interface ContextSyncMessage {
  readonly v: 1;
  readonly type: ContextSyncEventType;
  /** Random per-tab id so a tab can ignore its own events. */
  readonly source: string;
  /** Sender wall clock (diagnostic only; never used for ordering/trust). */
  readonly at: number;
}

const SOURCE_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

export function buildContextSyncMessage(
  type: ContextSyncEventType,
  source: string,
  at: number,
): ContextSyncMessage {
  return { v: 1, type, source, at };
}

/** Strict parse; anything unexpected is dropped (returns null). */
export function parseContextSyncMessage(
  data: unknown,
): ContextSyncMessage | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  const record = data as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== 4 ||
    !["v", "type", "source", "at"].every((key) => keys.includes(key))
  ) {
    return null;
  }
  if (record.v !== 1) return null;
  if (
    typeof record.type !== "string" ||
    !(CONTEXT_SYNC_EVENT_TYPES as readonly string[]).includes(record.type)
  ) {
    return null;
  }
  if (
    typeof record.source !== "string" ||
    !SOURCE_PATTERN.test(record.source)
  ) {
    return null;
  }
  if (typeof record.at !== "number" || !Number.isFinite(record.at)) {
    return null;
  }
  return {
    v: 1,
    type: record.type as ContextSyncEventType,
    source: record.source,
    at: record.at,
  };
}

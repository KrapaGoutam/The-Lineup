import {
  buildContextSyncMessage,
  CONTEXT_SYNC_CHANNEL,
  parseContextSyncMessage,
} from "@/features/context/domain/context-sync";
import type {
  ContextSyncEventType,
  ContextSyncMessage,
} from "@/features/context/domain/context-sync";

/**
 * V2-003.005 browser-only BroadcastChannel wrapper.
 *
 * Notification only: a received message is never read for an id, never copied
 * into state and never causes a cookie write -- subscribers merely schedule a
 * SERVER verification. Unsupported / blocked BroadcastChannel degrades to a
 * silent no-op (focus / visibility / pageshow reconciliation and the server
 * consistency check still protect the tab). Nothing is stored anywhere:
 * no localStorage / sessionStorage / cookie access.
 *
 * One lazily created channel per document; subscribers only add and remove
 * listeners, so remounts cannot leak channels or duplicate handlers.
 */

let channel: BroadcastChannel | null | undefined;
let tabId: string | null = null;

function getTabId(): string {
  if (tabId) return tabId;
  tabId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return tabId;
}

function getChannel(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  try {
    channel =
      typeof BroadcastChannel === "function"
        ? new BroadcastChannel(CONTEXT_SYNC_CHANNEL)
        : null;
  } catch {
    channel = null;
  }
  return channel;
}

export function isContextSyncSupported(): boolean {
  return getChannel() !== null;
}

/**
 * Announce that the shared context may have changed. Call ONLY after the
 * server confirmed the change. Never throws.
 */
export function publishContextEvent(type: ContextSyncEventType): void {
  const active = getChannel();
  if (!active) return;
  try {
    active.postMessage(buildContextSyncMessage(type, getTabId(), Date.now()));
  } catch {
    // A closed/blocked channel must not break the user's action.
  }
}

/** Listen for events from OTHER tabs. Returns an idempotent unsubscribe. */
export function subscribeContextEvents(
  handler: (message: ContextSyncMessage) => void,
): () => void {
  const active = getChannel();
  if (!active) return () => {};
  const listener = (event: MessageEvent) => {
    const message = parseContextSyncMessage(event.data);
    if (!message || message.source === getTabId()) return;
    handler(message);
  };
  active.addEventListener("message", listener);
  return () => active.removeEventListener("message", listener);
}

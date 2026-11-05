/**
 * V2-003.004 — request-consistency signal (NEVER an authorization source).
 *
 * Server Actions are POSTed from the page URL, so the browser's same-origin
 * `Referer` names the workspace the user is LOOKING at. Since V2-003.004 the
 * persisted (cookie) context decides which location an operation runs in; the
 * Referer can only make the request fail CLOSED when what the user is looking
 * at disagrees with what the server would operate on (browser back/forward to
 * a previous `?location=`, a second tab that switched workspace, a direct deep
 * link that has not been reconciled yet).
 *
 * It can never select, widen or substitute a location, and its absence never
 * changes the outcome (a request without a Referer is resolved from the
 * persisted context alone).
 */

import { parseExplicitLocationSelection } from "@/features/context/domain/active-context";
import type { ExplicitLocationSelection } from "@/features/context/domain/active-context";

export type RequestWorkspaceHint =
  /** No usable same-origin workspace URL with an explicit location. */
  | { readonly status: "none" }
  | {
      readonly status: "explicit";
      readonly routeSlug: string;
      readonly selection: ExplicitLocationSelection;
    }
  /** The Referer is a workspace URL whose slug cannot be decoded. */
  | { readonly status: "unreadable" };

export function parseRequestWorkspaceHint(input: {
  readonly referer: string | null | undefined;
  readonly host: string | null | undefined;
}): RequestWorkspaceHint {
  if (!input.referer) return { status: "none" };
  let url: URL;
  try {
    url = new URL(input.referer);
  } catch {
    return { status: "none" };
  }
  // Cross-origin or unknown-host referers carry no information we trust.
  if (!input.host || url.host !== input.host) return { status: "none" };

  const route = /^\/r\/([^/]+)\/?$/.exec(url.pathname);
  if (!route) return { status: "none" };

  const values = url.searchParams.getAll("location");
  if (values.length === 0) return { status: "none" };

  let routeSlug: string;
  try {
    routeSlug = decodeURIComponent(route[1]).trim().toLowerCase();
  } catch {
    return { status: "unreadable" };
  }
  return {
    status: "explicit",
    routeSlug,
    selection: parseExplicitLocationSelection(
      values.length === 1 ? values[0] : values,
    ),
  };
}

/**
 * Does the workspace the user is looking at agree with the verified context
 * the server is about to operate on? `none` agrees (nothing to contradict).
 */
export function hintAgreesWithContext(
  hint: RequestWorkspaceHint,
  verified: { readonly organizationSlug: string; readonly locationId: string },
): boolean {
  if (hint.status === "none") return true;
  if (hint.status === "unreadable") return false;
  if (hint.selection.status !== "present") return false;
  return (
    hint.routeSlug === verified.organizationSlug.trim().toLowerCase() &&
    hint.selection.locationId === verified.locationId.toLowerCase()
  );
}

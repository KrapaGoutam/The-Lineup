/**
 * V2-003.002 — pure helpers for the switcher's explicit URL selection.
 *
 * The `?location=<uuid>` parameter is a PREFERENCE that the server validates
 * (see `resolveActiveContext`); building the URL here grants nothing.
 */

import type { AvailableContextSummary } from "@/features/context/domain/active-context";

export const LOCATION_PARAM = "location";

/**
 * Query parameters that may travel across a context switch. Everything else
 * (notably `recipe`/`mode` detail ids) can refer to records that belong to the
 * previous location, so it is dropped and the user lands on a safe general
 * workspace.
 */
const CARRY_ACROSS_SWITCH = ["tab"] as const;

/** Canonical organization route for a slug (slug is URL-encoded). */
export function organizationPath(organizationSlug: string): string {
  return `/r/${encodeURIComponent(organizationSlug)}`;
}

/**
 * Destination for choosing `target` while the browser is at `currentSearch`.
 * Always the target organization's canonical route plus the explicit location;
 * only `tab` is carried over.
 */
export function contextSwitchHref(
  target: Pick<AvailableContextSummary, "organizationSlug" | "locationId">,
  currentSearch: string,
): string {
  const current = new URLSearchParams(currentSearch);
  const next = new URLSearchParams();
  for (const key of CARRY_ACROSS_SWITCH) {
    const value = current.get(key);
    if (value) next.set(key, value);
  }
  next.set(LOCATION_PARAM, target.locationId);
  return `${organizationPath(target.organizationSlug)}?${next.toString()}`;
}

export interface ContextGroup {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly locations: readonly AvailableContextSummary[];
}

/**
 * Groups the (already server-verified, deterministically ordered) list under
 * its organizations, preserving the incoming order.
 */
export function groupContextsByOrganization(
  contexts: readonly AvailableContextSummary[],
): ContextGroup[] {
  const groups: { -readonly [K in keyof ContextGroup]: ContextGroup[K] }[] = [];
  const byId = new Map<string, AvailableContextSummary[]>();
  for (const context of contexts) {
    let list = byId.get(context.organizationId);
    if (!list) {
      list = [];
      byId.set(context.organizationId, list);
      groups.push({
        organizationId: context.organizationId,
        organizationName: context.organizationName,
        locations: list,
      });
    }
    list.push(context);
  }
  return groups;
}

/** Stable key identifying the verified workspace; used to key client state. */
export function contextIdentityKey(
  profileId: string,
  organizationId: string,
  locationId: string,
): string {
  return `${profileId}:${organizationId}:${locationId}`;
}

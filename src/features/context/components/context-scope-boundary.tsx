"use client";

import { Fragment, type ReactNode } from "react";

import { contextIdentityKey } from "@/features/context/domain/context-navigation";

/**
 * V2-003.002: client-state isolation boundary.
 *
 * Children are keyed by the server-verified (profile, organization, location).
 * When any part changes React discards the whole subtree -- every piece of
 * location-specific state, pending timers and in-flight async continuations
 * (their `setState` lands on an unmounted instance and is dropped) -- and the
 * new subtree re-seeds from the freshly verified server props. The URL and
 * component state are never the authority; only these server-provided ids.
 */
export function ContextScopeBoundary({
  profileId,
  organizationId,
  locationId,
  extraKey,
  children,
}: {
  profileId: string;
  organizationId: string;
  locationId: string;
  extraKey?: string | number;
  children: ReactNode;
}) {
  const key = `${contextIdentityKey(profileId, organizationId, locationId)}:${extraKey ?? ""}`;
  return <Fragment key={key}>{children}</Fragment>;
}

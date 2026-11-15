"use client";

import { useCallback, useEffect, useState } from "react";
import { listManageableKioskLocationsAction } from "../actions/kiosk-admin-actions";
import type { ManageableKioskLocation } from "../domain/kiosk-device";

export type ManageableKioskLocationsState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | {
      readonly status: "ready";
      readonly locations: readonly ManageableKioskLocation[];
    }
  | { readonly status: "error"; readonly message: string };

/**
 * D7. Asks the server (which asks the database predicate) which locations the
 * signed-in user may manage kiosk devices for. Fails closed: until the server
 * answers - and on any error - `locations` is empty and no entry is offered.
 * The result is a visibility aid only; every kiosk action re-authorizes.
 */
export function useManageableKioskLocations(enabled: boolean) {
  const [state, setState] = useState<ManageableKioskLocationsState>(
    enabled ? { status: "loading" } : { status: "idle" },
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    listManageableKioskLocationsAction()
      .then((result) => {
        if (!alive) return;
        setState(
          result.ok
            ? { status: "ready", locations: result.data }
            : { status: "error", message: result.error },
        );
      })
      .catch(() => {
        if (alive) {
          setState({
            status: "error",
            message: "Failed to load your kiosk locations.",
          });
        }
      });
    return () => {
      alive = false;
    };
  }, [enabled, attempt]);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  const locations: readonly ManageableKioskLocation[] =
    state.status === "ready" ? state.locations : [];

  return { state, locations, reload };
}

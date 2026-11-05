"use client";

import { RefreshCw, ShieldAlert } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { verifyWorkspaceContextAction } from "@/features/context/actions/context-actions";
import { currentNavigationOrigin } from "@/features/context/components/history-traversal";
import { subscribeContextEvents } from "@/features/context/components/context-sync-channel";
import { useContextSwitch } from "@/features/context/components/use-context-switch";
import type { AvailableContextSummary } from "@/features/context/domain/active-context";
import {
  groupContextsByOrganization,
  organizationPath,
  recoveryHref,
} from "@/features/context/domain/context-navigation";
import type {
  StaleReason,
  WorkspaceExpectation,
} from "@/features/context/domain/workspace-expectation";

/** Passive triggers (focus, visibility, online) re-check at most this often. */
export const PASSIVE_CHECK_MIN_INTERVAL_MS = 5_000;

type Blocked =
  | {
      readonly kind: "stale";
      readonly reason: StaleReason;
      readonly organizationSlug?: string;
    }
  | { readonly kind: "signed_out" };

const COPY: Record<
  StaleReason | "signed_out",
  { title: string; body: string }
> = {
  location_changed: {
    title: "Your active location changed in another tab",
    body: "The restaurant location for this session has changed. Refresh your workspace before continuing so your actions apply to the correct location.",
  },
  access_changed: {
    title: "Your access to this location changed",
    body: "This location is no longer available to your account, or your saved location is no longer valid. Refresh your workspace, or choose a location you can access.",
  },
  different_user: {
    title: "A different account is signed in",
    body: "Someone else signed in on this browser. Refresh to continue with the account that is signed in now.",
  },
  signed_out: {
    title: "You were signed out in another tab",
    body: "Your session ended. Refresh to sign in again.",
  },
};

/** Lets a descendant (e.g. a failed protected action) report a stale refusal. */
const ReportStaleContext = createContext<() => void>(() => {});
export function useReportStaleContext(): () => void {
  return useContext(ReportStaleContext);
}

/**
 * V2-003.005 stale-workspace guard.
 *
 * Wraps the SIGNED-IN, real-mode workspace. It asks the server -- never a
 * broadcast message -- whether the context the server would operate on still
 * equals the one this tab shows, on: a cross-tab notification, focus /
 * visibility / online, a bfcache restore or history traversal, and a protected
 * action the server refused. No polling. If the answer is "stale" the whole
 * workspace is UNMOUNTED (no operational content, no mutation controls) and
 * replaced by a recovery panel; the block is sticky until recovery remounts the
 * workspace from freshly verified server props.
 *
 * Nothing here writes the persisted context except the explicit
 * "Choose a location" action (the existing server-verified selection), and a
 * received event can never do even that.
 */
export function ContextSyncGuard({
  expected,
  contexts,
  contextsUnavailable = false,
  onRecovered,
  children,
}: {
  /** The workspace on screen (null disables the guard: demo / no context). */
  expected: WorkspaceExpectation | null;
  contexts: readonly AvailableContextSummary[];
  contextsUnavailable?: boolean;
  /** Re-seed all client state from the (freshly refreshed) server props. */
  onRecovered: () => void;
  children: ReactNode;
}) {
  const profileId = expected?.profileId ?? null;
  const organizationId = expected?.organizationId ?? null;
  const locationId = expected?.locationId ?? null;
  const expectation = useMemo<WorkspaceExpectation | null>(
    () =>
      profileId && organizationId && locationId
        ? { profileId, organizationId, locationId }
        : null,
    [profileId, organizationId, locationId],
  );

  const [blocked, setBlocked] = useState<Blocked | null>(null);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const queued = useRef(false);
  const lastCheckAt = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const ask = useCallback(async () => {
    if (!expectation) return null;
    try {
      return await verifyWorkspaceContextAction(expectation);
    } catch {
      return null; // network / server outage: no conclusion
    }
  }, [expectation]);

  const verify = useCallback(
    async (force: boolean) => {
      if (!expectation) return;
      if (inFlight.current) {
        // A passive trigger during a check adds nothing; a forced one (a
        // broadcast, a refusal) must not be lost, so exactly one follow-up.
        if (force) queued.current = true;
        return;
      }
      if (
        !force &&
        Date.now() - lastCheckAt.current < PASSIVE_CHECK_MIN_INTERVAL_MS
      ) {
        return;
      }
      inFlight.current = true;
      try {
        do {
          queued.current = false;
          lastCheckAt.current = Date.now();
          const verdict = await ask();
          if (!mounted.current || !verdict) break;
          if (verdict.status === "stale") {
            setBlocked({
              kind: "stale",
              reason: verdict.reason,
              organizationSlug: verdict.organizationSlug,
            });
          } else if (verdict.status === "signed_out") {
            setBlocked({ kind: "signed_out" });
          }
          // consistent / unavailable: conclude nothing, change nothing.
        } while (queued.current && mounted.current);
      } finally {
        inFlight.current = false;
      }
    },
    [expectation, ask],
  );

  useEffect(() => {
    if (!expectation) return;
    const unsubscribe = subscribeContextEvents(() => {
      void verify(true);
    });
    const passive = () => {
      if (document.visibilityState === "hidden") return;
      void verify(false);
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void verify(true);
    };
    window.addEventListener("focus", passive);
    window.addEventListener("online", passive);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", passive);
    // A workspace restored by back/forward may be an old render: check once.
    if (currentNavigationOrigin() === "history") void verify(true);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", passive);
      window.removeEventListener("online", passive);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", passive);
    };
  }, [expectation, verify]);

  // The server refused a protected action: it IS stale. Block immediately,
  // then ask why (the reason only refines the copy).
  const reportStale = useCallback(() => {
    setBlocked(
      (current) => current ?? { kind: "stale", reason: "location_changed" },
    );
    void verify(true);
  }, [verify]);

  if (blocked && expectation) {
    return (
      <StalePanel
        blocked={blocked}
        contexts={contexts}
        contextsUnavailable={contextsUnavailable}
        ask={ask}
        onRecovered={onRecovered}
      />
    );
  }

  return (
    <ReportStaleContext.Provider value={reportStale}>
      {children}
    </ReportStaleContext.Provider>
  );
}

function StalePanel({
  blocked,
  contexts,
  contextsUnavailable,
  ask,
  onRecovered,
}: {
  blocked: Blocked;
  contexts: readonly AvailableContextSummary[];
  contextsUnavailable: boolean;
  ask: () => Promise<Awaited<
    ReturnType<typeof verifyWorkspaceContextAction>
  > | null>;
  onRecovered: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isRefreshing, startRefresh] = useTransition();
  const [phase, setPhase] = useState<"idle" | "refreshing" | "failed">("idle");
  const [choosing, setChoosing] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const { switchingTo, switchTo, switchError } = useContextSwitch();

  const reason = blocked.kind === "signed_out" ? "signed_out" : blocked.reason;
  const copy = COPY[reason];
  const canChoose =
    (reason === "location_changed" || reason === "access_changed") &&
    !contextsUnavailable &&
    contexts.length > 0;
  const groups = useMemo(
    () => groupContextsByOrganization(contexts),
    [contexts],
  );

  // The workspace that had focus just disappeared: land on the primary action.
  useEffect(() => {
    panelRef.current?.querySelector("button")?.focus();
  }, []);

  function refreshWorkspace() {
    setPhase("refreshing");
    // Re-resolve from the verified persisted context. The address bar names
    // the stale location (`?location=`); reloading THAT would be read as a
    // deliberate selection and rewrite the cookie back to it, so only the
    // module (`?tab=`) is carried over.
    // Go to the organization the SERVER now operates on (its verified slug),
    // else stay on the current route.
    const base =
      blocked.kind === "stale" && blocked.organizationSlug
        ? organizationPath(blocked.organizationSlug)
        : pathname;
    const href = recoveryHref(base, window.location.search);
    startRefresh(() => {
      router.replace(href);
      router.refresh();
    });
  }

  // "Choose a location" can legitimately pick the location this tab ALREADY
  // shows (the other tab moved away, the user moved it back). The workspace key
  // is then unchanged, so nothing remounts on its own and the block would stay
  // forever: once the verified selection has finished navigating, re-check and
  // re-seed. (A different location re-keys the workspace and unmounts us.)
  const wasSwitching = useRef(false);
  useEffect(() => {
    if (switchingTo) {
      wasSwitching.current = true;
      return;
    }
    if (!wasSwitching.current || switchError) return;
    wasSwitching.current = false;
    let alive = true;
    void (async () => {
      const verdict = await ask();
      if (alive && verdict?.status === "consistent") onRecovered();
    })();
    return () => {
      alive = false;
    };
  }, [switchingTo, switchError, ask, onRecovered]);

  // After the refresh settles: if this very workspace is still the verified
  // one (a different one would have re-keyed and unmounted us), re-seed from
  // the refreshed props; otherwise stay closed rather than loop.
  useEffect(() => {
    if (phase !== "refreshing" || isRefreshing) return;
    let alive = true;
    void (async () => {
      const verdict = await ask();
      if (!alive) return;
      if (verdict?.status === "consistent") onRecovered();
      else setPhase("failed");
    })();
    return () => {
      alive = false;
    };
  }, [phase, isRefreshing, ask, onRecovered]);

  return (
    <main
      ref={panelRef}
      className="mx-auto flex min-h-dvh max-w-xl items-center justify-center p-4"
      data-testid="context-stale"
      data-stale-reason={reason}
    >
      <div className="border-border bg-card flex w-full flex-col gap-3 rounded-2xl border p-6">
        <div className="flex items-center gap-2">
          <ShieldAlert aria-hidden className="text-muted-foreground size-5" />
          <h1 className="text-lg font-semibold">{copy.title}</h1>
        </div>
        <p role="alert" className="text-muted-foreground text-sm">
          {copy.body}
        </p>
        {phase === "failed" ? (
          <p role="status" className="text-sm font-medium">
            We couldn&apos;t confirm your workspace yet. Try again, or choose a
            location.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            className="min-h-11"
            disabled={phase === "refreshing"}
            onClick={refreshWorkspace}
          >
            <RefreshCw aria-hidden className="size-4" />
            {phase === "refreshing" ? "Refreshing…" : "Refresh workspace"}
          </Button>
          {canChoose ? (
            <Button
              variant="outline"
              className="min-h-11"
              aria-expanded={choosing}
              onClick={() => setChoosing((value) => !value)}
            >
              Choose a location
            </Button>
          ) : null}
        </div>
        {canChoose && choosing ? (
          <div
            role="group"
            aria-label="Choose a location"
            className="flex flex-col gap-3"
          >
            {groups.map((group) => (
              <div key={group.organizationId} className="flex flex-col gap-1">
                <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
                  {group.organizationName}
                </p>
                {group.locations.map((context) => (
                  <Button
                    key={context.locationId}
                    variant="outline"
                    className="min-h-11 justify-start"
                    disabled={!!switchingTo}
                    data-location-id={context.locationId}
                    onClick={() => void switchTo(context)}
                  >
                    {context.locationName}
                  </Button>
                ))}
              </div>
            ))}
            {switchError ? (
              <p role="alert" className="text-sm">
                {switchError}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}

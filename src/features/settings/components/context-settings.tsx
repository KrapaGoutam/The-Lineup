"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AppearanceSwitch } from "@/components/appearance-switch";
import { PasscodeChangeDialog } from "@/components/passcode-change-dialog";
import { requestSignOut } from "@/lib/client-sign-out";
import { LocationAdministration } from "@/features/locations/components/location-administration";
import { getLocationAdminContextAction } from "@/features/locations/actions/location-admin-actions";
import { loadAccountRecoveryAction } from "../actions/account-recovery-actions";
import { AccountRecovery } from "./account-recovery";

/** System-only Settings when lifecycle/access reconciliation has closed the operational workspace. */
export function ContextSettings({
  restaurantSlug,
  onBack,
}: {
  restaurantSlug: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<Awaited<
    ReturnType<typeof loadAccountRecoveryAction>
  > | null>(null);
  const [locations, setLocations] = useState(false);
  const [canManageLocations, setCanManageLocations] = useState(false);
  const [changePasscode, setChangePasscode] = useState(false);
  useEffect(() => {
    let alive = true;
    // Location administration can be authorized by Overall authority even
    // when the legacy organization passcode endpoint has no local membership.
    // Keep those existing authorities independent; never infer one from the other.
    getLocationAdminContextAction()
      .then((result) => {
        if (alive)
          setCanManageLocations(
            result.ok && result.data.canAdministerLocations,
          );
      })
      .catch(() => {
        if (alive) setCanManageLocations(false);
      });
    loadAccountRecoveryAction(restaurantSlug)
      .then((result) => {
        if (alive) setData(result);
      })
      .catch(() => {
        if (alive) setData({ ok: false });
      });
    return () => {
      alive = false;
    };
  }, [restaurantSlug]);
  if (locations)
    return (
      <LocationAdministration
        demoMode={false}
        onBack={() => setLocations(false)}
      />
    );
  return (
    <div className="flex w-full flex-col gap-5">
      <Card>
        <CardHeader>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-muted-foreground text-sm">
            Choose an available location to resume operations. Account and
            authorized location administration remain available here.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button variant="secondary" onClick={onBack}>
            Back to location recovery
          </Button>
          {canManageLocations ? (
            <Button onClick={() => setLocations(true)}>
              Manage locations and modules
            </Button>
          ) : null}
          {!data ? (
            <p role="status">Loading account controls…</p>
          ) : !data.ok ? (
            <p role="alert">
              Account recovery is unavailable. Try again or sign in to your
              organization.
            </p>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => setChangePasscode(true)}
              >
                Change your passcode
              </Button>
            </>
          )}
          <AppearanceSwitch />
          <Button
            variant="outline"
            onClick={async () => {
              await requestSignOut();
              router.refresh();
            }}
          >
            Sign out
          </Button>
        </CardContent>
      </Card>
      {data?.ok ? (
        <AccountRecovery
          user={data.user}
          team={data.team}
          onResetPasscode={async (input) => {
            const response = await fetch("/api/auth/passcode/reset", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ restaurantSlug, ...input }),
            });
            const result = (await response.json()) as {
              ok?: boolean;
              passcode?: string;
              error?: string;
            };
            return response.ok &&
              result.ok &&
              typeof result.passcode === "string"
              ? { ok: true, passcode: result.passcode }
              : {
                  ok: false,
                  error:
                    result.error ?? "Unable to reset this passcode right now.",
                };
          }}
        />
      ) : null}
      {changePasscode ? (
        <PasscodeChangeDialog
          onClose={() => setChangePasscode(false)}
          onSubmit={async (input) => {
            const response = await fetch("/api/auth/passcode/change", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ restaurantSlug, ...input }),
            });
            const result = (await response.json()) as {
              ok?: boolean;
              error?: string;
            };
            return response.ok && result.ok
              ? { ok: true }
              : {
                  ok: false,
                  error:
                    result.error ?? "Unable to change your passcode right now.",
                };
          }}
        />
      ) : null}
    </div>
  );
}

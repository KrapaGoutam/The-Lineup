"use client";

import * as React from "react";
import type { KioskActiveContext } from "../domain/kiosk-device";
import { KioskHomeScreen } from "./kiosk-home-screen";
import { KioskAttendanceScreen } from "./kiosk-attendance-screen";
import { KioskPairingScreen } from "./kiosk-pairing-screen";

export interface KioskEmployeeSessionState {
  readonly profileId: string;
  readonly displayName: string;
  readonly locationId: string;
  readonly organizationId: string;
  readonly roles?: readonly string[];
}

export interface KioskAppProps {
  readonly context: KioskActiveContext;
  readonly initialSession?: KioskEmployeeSessionState | null;
}

export function KioskApp({ context, initialSession = null }: KioskAppProps) {
  const [deviceContext, setDeviceContext] =
    React.useState<KioskActiveContext | null>(context);
  const [employeeSession, setEmployeeSession] =
    React.useState<KioskEmployeeSessionState | null>(initialSession);

  // If the device is revoked or unpaired
  if (!deviceContext || deviceContext.status === "revoked") {
    return <KioskPairingScreen onPaired={(ctx) => setDeviceContext(ctx)} />;
  }

  // If an employee is authenticated via PIN
  if (employeeSession) {
    return (
      <KioskAttendanceScreen
        context={deviceContext}
        employee={employeeSession}
        onFinished={() => setEmployeeSession(null)}
        onDeviceRevoked={() => setDeviceContext(null)}
      />
    );
  }

  // Idle state: PIN pad entry
  return (
    <KioskHomeScreen
      context={deviceContext}
      onAuthenticated={(session) => setEmployeeSession(session)}
      onDeviceRevoked={() => setDeviceContext(null)}
    />
  );
}

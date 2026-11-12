import { getKioskDeviceStatusAction } from "@/features/kiosk/actions/kiosk-pairing-actions";
import { KioskApp } from "@/features/kiosk/components/kiosk-app";
import { KioskPairingScreen } from "@/features/kiosk/components/kiosk-pairing-screen";

export const dynamic = "force-dynamic";

export default async function KioskPage() {
  const statusRes = await getKioskDeviceStatusAction();

  if (!statusRes.ok || !statusRes.data.paired || !statusRes.data.context) {
    return <KioskPairingScreen />;
  }

  return <KioskApp context={statusRes.data.context} />;
}

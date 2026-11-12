"use client";

import * as React from "react";
import {
  AlertCircle,
  Check,
  Clock,
  Copy,
  Edit2,
  MoveRight,
  Plus,
  RefreshCw,
  Tablet,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatPairingCode,
  type KioskDevice,
  type KioskPairingResult,
} from "../domain/kiosk-device";
import {
  generateKioskPairingCodeAction,
  listKioskDevicesAction,
  reassignKioskDeviceAction,
  renameKioskDeviceAction,
  revokeKioskDeviceAction,
} from "../actions/kiosk-admin-actions";

export interface LocationKioskManagementProps {
  readonly locationId: string;
  readonly locationName: string;
  readonly availableLocations?: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  readonly demoMode?: boolean;
}

export function LocationKioskManagement({
  locationId,
  locationName,
  availableLocations = [],
  demoMode = false,
}: LocationKioskManagementProps) {
  const [loading, setLoading] = React.useState(true);
  const [devices, setDevices] = React.useState<readonly KioskDevice[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  // Pairing modal state
  const [pairingModalOpen, setPairingModalOpen] = React.useState(false);
  const [newDeviceName, setNewDeviceName] = React.useState("Station Tablet");
  const [pairingLoading, setPairingLoading] = React.useState(false);
  const [pairingResult, setPairingResult] =
    React.useState<KioskPairingResult | null>(null);
  const [copied, setCopied] = React.useState(false);

  // Rename modal state
  const [renamingDevice, setRenamingDevice] =
    React.useState<KioskDevice | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [renameLoading, setRenameLoading] = React.useState(false);

  // Reassign modal state
  const [reassigningDevice, setReassigningDevice] =
    React.useState<KioskDevice | null>(null);
  const [selectedNewLocationId, setSelectedNewLocationId] = React.useState("");
  const [reassignLoading, setReassignLoading] = React.useState(false);

  // Revoke modal state
  const [revokingDevice, setRevokingDevice] =
    React.useState<KioskDevice | null>(null);
  const [revocationReason, setRevocationReason] = React.useState("");
  const [revokeLoading, setRevokeLoading] = React.useState(false);

  const fetchDevices = React.useCallback(async () => {
    if (demoMode) {
      setDevices([
        {
          id: "demo-dev-1",
          organizationId: "demo-org-1",
          locationId,
          name: "Front Bar Tablet",
          status: "active",
          credentialVersion: 1,
          lastSeenAt: new Date().toISOString(),
          revokedAt: null,
          revokedBy: null,
          revocationReason: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await listKioskDevicesAction({ locationId });
      if (res.ok) {
        setDevices(res.data);
      } else {
        setError(res.error);
      }
    } catch {
      setError("Failed to load kiosk devices.");
    } finally {
      setLoading(false);
    }
  }, [locationId, demoMode]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchDevices();
  }, [fetchDevices]);

  // Handle generating pairing code
  async function handleGeneratePairing() {
    if (!newDeviceName.trim()) return;
    setPairingLoading(true);
    setError(null);

    if (demoMode) {
      setPairingResult({
        pairingId: "demo-pair-1",
        locationId,
        organizationId: "demo-org-1",
        deviceName: newDeviceName.trim(),
        pairingCode: "DEMO99",
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      });
      setPairingLoading(false);
      return;
    }

    try {
      const res = await generateKioskPairingCodeAction({
        locationId,
        deviceName: newDeviceName.trim(),
      });
      if (res.ok) {
        setPairingResult(res.data);
      } else {
        setError(res.error);
      }
    } catch {
      setError("Failed to generate pairing code.");
    } finally {
      setPairingLoading(false);
    }
  }

  // Handle renaming
  async function handleRenameSubmit() {
    if (!renamingDevice || !renameValue.trim()) return;
    setRenameLoading(true);

    if (demoMode) {
      setDevices((prev) =>
        prev.map((d) =>
          d.id === renamingDevice.id ? { ...d, name: renameValue.trim() } : d,
        ),
      );
      setRenamingDevice(null);
      setRenameLoading(false);
      return;
    }

    try {
      const res = await renameKioskDeviceAction({
        deviceId: renamingDevice.id,
        name: renameValue.trim(),
      });
      if (res.ok) {
        setRenamingDevice(null);
        await fetchDevices();
      } else {
        setError(res.error);
      }
    } catch {
      setError("Failed to rename device.");
    } finally {
      setRenameLoading(false);
    }
  }

  // Handle reassigning
  async function handleReassignSubmit() {
    if (!reassigningDevice || !selectedNewLocationId) return;
    setReassignLoading(true);

    if (demoMode) {
      setDevices((prev) => prev.filter((d) => d.id !== reassigningDevice.id));
      setReassigningDevice(null);
      setReassignLoading(false);
      return;
    }

    try {
      const res = await reassignKioskDeviceAction({
        deviceId: reassigningDevice.id,
        newLocationId: selectedNewLocationId,
      });
      if (res.ok) {
        setReassigningDevice(null);
        await fetchDevices();
      } else {
        setError(res.error);
      }
    } catch {
      setError("Failed to reassign device.");
    } finally {
      setReassignLoading(false);
    }
  }

  // Handle revoking
  async function handleRevokeSubmit() {
    if (!revokingDevice) return;
    setRevokeLoading(true);

    if (demoMode) {
      setDevices((prev) =>
        prev.map((d) =>
          d.id === revokingDevice.id
            ? {
                ...d,
                status: "revoked",
                revocationReason: revocationReason.trim() || null,
              }
            : d,
        ),
      );
      setRevokingDevice(null);
      setRevokeLoading(false);
      return;
    }

    try {
      const res = await revokeKioskDeviceAction({
        deviceId: revokingDevice.id,
        reason: revocationReason.trim() || undefined,
      });
      if (res.ok) {
        setRevokingDevice(null);
        await fetchDevices();
      } else {
        setError(res.error);
      }
    } catch {
      setError("Failed to revoke device.");
    } finally {
      setRevokeLoading(false);
    }
  }

  function handleCopyCode() {
    if (!pairingResult) return;
    void navigator.clipboard.writeText(pairingResult.pairingCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-foreground flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Tablet className="text-primary h-5 w-5" />
            Station Kiosk Tablets
          </h3>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Manage physical tablets paired to {locationName} for employee
            clock-in and clock-out.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchDevices()}
            disabled={loading}
            aria-label="Refresh devices"
          >
            <RefreshCw
              className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setNewDeviceName("Station Tablet");
              setPairingResult(null);
              setPairingModalOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add Kiosk Device
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border-destructive/20 text-destructive flex items-center gap-2 rounded-md border p-3 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <Card className="text-muted-foreground p-8 text-center">
          <RefreshCw className="text-primary mx-auto mb-2 h-6 w-6 animate-spin" />
          Loading paired kiosk devices...
        </Card>
      ) : devices.length === 0 ? (
        <Card className="p-8 text-center">
          <Tablet className="text-muted-foreground/40 mx-auto mb-3 h-10 w-10" />
          <h4 className="text-foreground text-base font-medium">
            No kiosk devices paired
          </h4>
          <p className="text-muted-foreground mx-auto mt-1 mb-4 max-w-sm text-sm">
            Pair a physical tablet stationed at {locationName} so staff can
            quickly clock in and out with their 4-digit PIN.
          </p>
          <Button
            size="sm"
            onClick={() => {
              setNewDeviceName("Station Tablet");
              setPairingResult(null);
              setPairingModalOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add Kiosk Device
          </Button>
        </Card>
      ) : (
        <div className="grid gap-3">
          {devices.map((device) => {
            const isRevoked = device.status === "revoked";
            return (
              <Card
                key={device.id}
                className={`transition-colors ${isRevoked ? "bg-muted/10 border-dashed opacity-60" : "border-border/60"}`}
              >
                <CardContent className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground text-base font-medium">
                        {device.name}
                      </span>
                      {isRevoked ? (
                        <Badge tone="danger">Revoked</Badge>
                      ) : (
                        <Badge tone="success">Active</Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <span>
                        Paired:{" "}
                        {new Date(device.createdAt).toLocaleDateString()}
                      </span>
                      {device.lastSeenAt ? (
                        <span>
                          Last active:{" "}
                          {new Date(device.lastSeenAt).toLocaleTimeString()}
                        </span>
                      ) : (
                        <span>Last active: Never</span>
                      )}
                      {device.revocationReason && (
                        <span className="text-destructive">
                          Reason: {device.revocationReason}
                        </span>
                      )}
                    </div>
                  </div>

                  {!isRevoked && (
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setRenamingDevice(device);
                          setRenameValue(device.name);
                        }}
                        aria-label={`Rename ${device.name}`}
                      >
                        <Edit2 className="mr-1 h-3.5 w-3.5" />
                        Rename
                      </Button>
                      {availableLocations.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setReassigningDevice(device);
                            const other = availableLocations.find(
                              (l) => l.id !== locationId,
                            );
                            setSelectedNewLocationId(other?.id || "");
                          }}
                          aria-label={`Reassign ${device.name}`}
                        >
                          <MoveRight className="mr-1 h-3.5 w-3.5" />
                          Reassign
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          setRevokingDevice(device);
                          setRevocationReason("");
                        }}
                        aria-label={`Revoke ${device.name}`}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Revoke
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Kiosk / Pairing Modal */}
      <Dialog
        open={pairingModalOpen}
        onClose={() => setPairingModalOpen(false)}
        title="Pair Kiosk Device"
        description={`Generate a one-time pairing code to authorize a physical tablet at ${locationName}.`}
      >
        {!pairingResult ? (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="device-name">Device Name / Label</Label>
              <Input
                id="device-name"
                placeholder="e.g. Front Bar Tablet, Host Stand Tablet"
                value={newDeviceName}
                onChange={(e) => setNewDeviceName(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setPairingModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleGeneratePairing()}
                disabled={pairingLoading || !newDeviceName.trim()}
              >
                {pairingLoading ? "Generating..." : "Generate Pairing Code"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5 pt-2">
            <div className="bg-muted/40 border-border space-y-2 rounded-lg border p-4 text-center">
              <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                One-Time Pairing Code
              </p>
              <div className="text-primary flex items-center justify-center gap-2 font-mono text-3xl font-bold tracking-widest">
                <span>{formatPairingCode(pairingResult.pairingCode)}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground h-8 w-8"
                  onClick={handleCopyCode}
                  aria-label="Copy code"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
                <Clock className="text-warn h-3.5 w-3.5" />
                Expires in 15 minutes
              </p>
            </div>

            <div className="text-muted-foreground bg-surface/50 border-border/40 space-y-2 rounded border p-3 text-sm">
              <p className="text-foreground font-medium">Instructions:</p>
              <ol className="list-inside list-decimal space-y-1 text-xs">
                <li>
                  Open{" "}
                  <code className="text-primary bg-muted/50 rounded px-1 py-0.5 font-mono">
                    /kiosk
                  </code>{" "}
                  on the physical tablet.
                </li>
                <li>Enter the 6-character pairing code shown above.</li>
                <li>The tablet will instantly pair to {locationName}.</li>
              </ol>
            </div>

            <div className="pt-2">
              <Button
                className="w-full"
                onClick={() => {
                  setPairingModalOpen(false);
                  void fetchDevices();
                }}
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Rename Modal */}
      <Dialog
        open={Boolean(renamingDevice)}
        onClose={() => setRenamingDevice(null)}
        title="Rename Kiosk Device"
        description="Update the display name for this tablet."
      >
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="rename-input">Device Name</Label>
            <Input
              id="rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              maxLength={100}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setRenamingDevice(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleRenameSubmit()}
              disabled={renameLoading || !renameValue.trim()}
            >
              {renameLoading ? "Saving..." : "Save Name"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Reassign Modal */}
      <Dialog
        open={Boolean(reassigningDevice)}
        onClose={() => setReassigningDevice(null)}
        title="Reassign Kiosk Device"
        description={`Move ${reassigningDevice?.name || "device"} to another location. Existing credentials will be rotated server-side.`}
      >
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="new-loc-select">Select New Location</Label>
            <select
              id="new-loc-select"
              className="border-input bg-background text-foreground focus-visible:ring-ring h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
              value={selectedNewLocationId}
              onChange={(e) => setSelectedNewLocationId(e.target.value)}
            >
              {availableLocations
                .filter((l) => l.id !== locationId)
                .map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setReassigningDevice(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleReassignSubmit()}
              disabled={reassignLoading || !selectedNewLocationId}
            >
              {reassignLoading ? "Reassigning..." : "Reassign Device"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Revoke Modal */}
      <Dialog
        open={Boolean(revokingDevice)}
        onClose={() => setRevokingDevice(null)}
        title="Revoke Kiosk Device"
        description={`Are you sure you want to revoke ${revokingDevice?.name || "this device"}? This immediately invalidates the tablet credentials server-side. Staff will not be able to clock in from this tablet.`}
      >
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="revoke-reason">
              Reason for Revocation (optional)
            </Label>
            <Input
              id="revoke-reason"
              placeholder="e.g. Lost tablet, hardware replacement, retired"
              value={revocationReason}
              onChange={(e) => setRevocationReason(e.target.value)}
              maxLength={200}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setRevokingDevice(null)}>
              Cancel
            </Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleRevokeSubmit()}
              disabled={revokeLoading}
            >
              {revokeLoading ? "Revoking..." : "Revoke Device"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

"use client";

import * as React from "react";
import { LocationModuleSettings } from "@/features/modules/components/location-module-settings";
import {
  createDemoModuleSettingsSource,
  liveModuleSettingsSource,
} from "@/features/modules/components/module-settings-source";
import { ArrowLeft, Building2, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { LocationList } from "./location-list";
import { LocationForm } from "./location-form";
import { LocationOperatingHoursEditor } from "./location-operating-hours-editor";
import { LocationStaffManagement } from "./location-staff-management";
import { OrganizationStaffAssignments } from "./organization-staff-assignments";
import {
  createLiveStaffAssignmentSource,
  type StaffAssignmentSource,
} from "./staff-assignment-source";
import { createDemoStaffAssignmentSource } from "./staff-assignment-demo";
import { createDemoLocationLifecycleSource } from "./location-lifecycle-demo";
import {
  createLiveLocationLifecycleSource,
  type LocationLifecycleSource,
} from "./location-lifecycle-source";
import { LocationLifecycleDialog } from "./location-lifecycle-dialog";
import { LocationLifecycleHistoryDialog } from "./location-lifecycle-history-dialog";
import {
  describeLifecycleAction,
  type LocationLifecycleAction,
} from "@/features/locations/domain/location-lifecycle";
import type {
  DayOperatingHours,
  Location,
} from "@/features/locations/domain/location";
import {
  getLocationAdminContextAction,
  getLocationOperatingHoursAction,
  listLocationsForAdminAction,
  provisionLocationAction,
  updateLocationDetailsAction,
  updateLocationOperatingHoursAction,
  type AdministrableOrganization,
} from "@/features/locations/actions/location-admin-actions";

export interface LocationAdministrationProps {
  readonly onBack: () => void;
  readonly demoMode?: boolean;
  readonly initialOrganizationId?: string;
}

const DEMO_ORGANIZATION: AdministrableOrganization = {
  id: "demo-org-1",
  name: "The Monk's Cellar",
  slug: "the-monks-cellar",
  role: "owner",
};

const DEMO_LOCATIONS: Location[] = [
  {
    id: "demo-loc-1",
    organizationId: "demo-org-1",
    name: "Webster Branch",
    timeZone: "America/Chicago",
    address: {
      line1: "123 Main St",
      city: "Webster",
      region: "TX",
      postalCode: "77598",
      countryCode: "US",
    },
    coverWeight: 0.25,
    active: true,
    openingLocal: "11:00",
    closingLocal: "23:00",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "demo-loc-2",
    organizationId: "demo-org-1",
    name: "NASA Branch",
    timeZone: "America/Chicago",
    address: {
      line1: "18100 Upper Bay Rd",
      city: "Houston",
      region: "TX",
      postalCode: "77058",
      countryCode: "US",
    },
    coverWeight: 0.25,
    active: true,
    openingLocal: "11:00",
    closingLocal: "02:00",
    createdAt: "2026-01-02T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  },
];

const DEMO_HOURS: DayOperatingHours[] = [
  {
    dayOfWeek: 0,
    openingLocal: "11:00",
    closingLocal: "22:00",
    closed: false,
  },
  {
    dayOfWeek: 1,
    openingLocal: "11:00",
    closingLocal: "23:00",
    closed: false,
  },
  {
    dayOfWeek: 2,
    openingLocal: "11:00",
    closingLocal: "23:00",
    closed: false,
  },
  {
    dayOfWeek: 3,
    openingLocal: "11:00",
    closingLocal: "23:00",
    closed: false,
  },
  {
    dayOfWeek: 4,
    openingLocal: "11:00",
    closingLocal: "23:00",
    closed: false,
  },
  {
    dayOfWeek: 5,
    openingLocal: "17:00",
    closingLocal: "02:00",
    closed: false,
    isOvernight: true,
  },
  {
    dayOfWeek: 6,
    openingLocal: "17:00",
    closingLocal: "02:00",
    closed: false,
    isOvernight: true,
  },
];

export function LocationAdministration({
  onBack,
  demoMode = false,
  initialOrganizationId,
}: LocationAdministrationProps) {
  const [loadingContext, setLoadingContext] = React.useState(true);
  const [canAdminister, setCanAdminister] = React.useState(true);
  const [organizations, setOrganizations] = React.useState<
    readonly AdministrableOrganization[]
  >([]);
  const [selectedOrgId, setSelectedOrgId] = React.useState<string>("");

  const [loadingLocations, setLoadingLocations] = React.useState(false);
  const [locations, setLocations] = React.useState<Location[]>([]);
  const [locationsError, setLocationsError] = React.useState<string | null>(
    null,
  );

  const [searchQuery, setSearchQuery] = React.useState("");
  const [isAddingLocation, setIsAddingLocation] = React.useState(false);
  const [managingLocation, setManagingLocation] =
    React.useState<Location | null>(null);
  const [manageTab, setManageTab] = React.useState<
    "details" | "hours" | "staff" | "modules"
  >("details");
  const [modulesPending, setModulesPending] = React.useState(false);
  const moduleSource = React.useMemo(
    () =>
      demoMode ? createDemoModuleSettingsSource() : liveModuleSettingsSource,
    [demoMode],
  );
  const [showStaffOverview, setShowStaffOverview] = React.useState(false);

  // Demo mode uses an isolated in-memory source that never reaches the
  // real assignment RPC; live mode uses the server-action-backed source.
  const staffSource = React.useMemo<StaffAssignmentSource>(
    () =>
      demoMode
        ? createDemoStaffAssignmentSource()
        : createLiveStaffAssignmentSource(),
    [demoMode],
  );

  // V2-002.005: same isolation rule for lifecycle changes. Demo transitions
  // are in-memory only and never reach the lifecycle RPC.
  const lifecycleSource = React.useMemo<LocationLifecycleSource>(
    () =>
      demoMode
        ? createDemoLocationLifecycleSource()
        : createLiveLocationLifecycleSource(),
    [demoMode],
  );
  const [lifecycleRequest, setLifecycleRequest] = React.useState<{
    readonly location: Location;
    readonly action: LocationLifecycleAction;
  } | null>(null);
  const [historyLocation, setHistoryLocation] = React.useState<Location | null>(
    null,
  );
  const [lifecycleNotice, setLifecycleNotice] = React.useState<string | null>(
    null,
  );

  const [loadingHours, setLoadingHours] = React.useState(false);
  const [operatingHours, setOperatingHours] = React.useState<
    DayOperatingHours[]
  >([]);

  const selectedOrg = organizations.find((o) => o.id === selectedOrgId);

  // 1. Load admin context on mount
  React.useEffect(() => {
    let isMounted = true;

    async function loadContext() {
      if (demoMode) {
        if (!isMounted) return;
        setOrganizations([DEMO_ORGANIZATION]);
        setSelectedOrgId(DEMO_ORGANIZATION.id);
        setLocations(DEMO_LOCATIONS);
        setCanAdminister(true);
        setLoadingContext(false);
        return;
      }

      setLoadingContext(true);
      try {
        const res = await getLocationAdminContextAction();
        if (!isMounted) return;

        if (!res.ok) {
          setCanAdminister(false);
          setLocationsError(res.error);
        } else {
          setCanAdminister(res.data.canAdministerLocations);
          setOrganizations(res.data.organizations);

          if (res.data.organizations.length > 0) {
            const preferred =
              initialOrganizationId &&
              res.data.organizations.some((o) => o.id === initialOrganizationId)
                ? initialOrganizationId
                : res.data.organizations[0].id;
            setSelectedOrgId(preferred);
          }
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        setCanAdminister(false);
        setLocationsError(
          err instanceof Error
            ? err.message
            : "Failed to load management access.",
        );
      } finally {
        if (isMounted) setLoadingContext(false);
      }
    }

    void loadContext();

    return () => {
      isMounted = false;
    };
  }, [demoMode, initialOrganizationId]);

  const [reloadKey, setReloadKey] = React.useState(0);

  const handleSelectOrg = (newOrgId: string) => {
    setSelectedOrgId(newOrgId);
    setIsAddingLocation(false);
    setManagingLocation(null);
    setShowStaffOverview(false);
    setLifecycleRequest(null);
    setHistoryLocation(null);
    setLifecycleNotice(null);
    setSearchQuery("");
  };

  function handleLifecycleCompleted(
    updated: Location,
    action: LocationLifecycleAction,
  ) {
    setLocations((prev) =>
      prev.map((l) => (l.id === updated.id ? updated : l)),
    );
    setManagingLocation((current) =>
      current && current.id === updated.id ? updated : current,
    );
    setLifecycleRequest(null);
    setLifecycleNotice(
      `${updated.name}: ${describeLifecycleAction(action).toLowerCase()} completed.`,
    );
    // Refresh from persisted data (live mode only; demo state is in-memory).
    if (!demoMode) setReloadKey((k) => k + 1);
  }

  // 2. Fetch locations whenever selectedOrgId or reloadKey changes
  React.useEffect(() => {
    let isCancelled = false;
    if (!selectedOrgId || loadingContext) return;

    async function load() {
      if (demoMode) {
        setLocations(DEMO_LOCATIONS);
        return;
      }

      setLoadingLocations(true);
      setLocationsError(null);
      try {
        const res = await listLocationsForAdminAction(selectedOrgId);
        if (isCancelled) return;
        if (!res.ok) {
          setLocationsError(res.error);
          setLocations([]);
        } else {
          setLocations(res.data);
        }
      } catch (err: unknown) {
        if (isCancelled) return;
        setLocationsError(
          err instanceof Error ? err.message : "Failed to load locations.",
        );
        setLocations([]);
      } finally {
        if (!isCancelled) {
          setLoadingLocations(false);
        }
      }
    }

    void Promise.resolve().then(load);

    return () => {
      isCancelled = true;
    };
  }, [selectedOrgId, loadingContext, demoMode, reloadKey]);

  // 3. Load operating hours when managing a location
  React.useEffect(() => {
    let isMounted = true;
    if (!managingLocation || !selectedOrgId) return;

    async function loadHours() {
      if (demoMode) {
        setOperatingHours(DEMO_HOURS);
        return;
      }

      setLoadingHours(true);
      try {
        const res = await getLocationOperatingHoursAction(
          managingLocation!.id,
          selectedOrgId,
        );
        if (!isMounted) return;
        if (res.ok) {
          setOperatingHours(res.data);
        }
      } catch {
        // Fallback to empty if fetch failed
      } finally {
        if (isMounted) setLoadingHours(false);
      }
    }

    void Promise.resolve().then(loadHours);

    return () => {
      isMounted = false;
    };
  }, [managingLocation, selectedOrgId, demoMode]);

  // Creation submission handler
  async function handleCreateLocation(data: {
    readonly name: string;
    readonly timeZone: string;
    readonly address: Location["address"];
    readonly coverWeight: number;
    readonly openingLocal: string;
    readonly closingLocal: string;
  }) {
    if (demoMode) {
      const synthetic: Location = {
        id: `demo-${Date.now()}`,
        organizationId: selectedOrgId,
        name: data.name,
        timeZone: data.timeZone,
        address: data.address,
        coverWeight: data.coverWeight,
        active: true,
        openingLocal: data.openingLocal,
        closingLocal: data.closingLocal,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setLocations((prev) => [synthetic, ...prev]);
      setIsAddingLocation(false);
      return { ok: true };
    }

    const res = await provisionLocationAction({
      organizationId: selectedOrgId,
      name: data.name,
      timeZone: data.timeZone,
      address: data.address,
      coverWeight: data.coverWeight,
      openingLocal: data.openingLocal,
      closingLocal: data.closingLocal,
    });

    if (res.ok) {
      setIsAddingLocation(false);
      setReloadKey((k) => k + 1);
      return { ok: true };
    }

    return { ok: false, error: res.error, code: res.code };
  }

  // Edit details submission handler
  async function handleUpdateLocationDetails(data: {
    readonly name: string;
    readonly timeZone: string;
    readonly address: Location["address"];
    readonly coverWeight: number;
    readonly openingLocal: string;
    readonly closingLocal: string;
  }) {
    if (!managingLocation) return { ok: false, error: "No location selected." };

    if (demoMode) {
      const updated: Location = {
        ...managingLocation,
        name: data.name,
        timeZone: data.timeZone,
        address: data.address,
        coverWeight: data.coverWeight,
        openingLocal: data.openingLocal,
        closingLocal: data.closingLocal,
        updatedAt: new Date().toISOString(),
      };
      setLocations((prev) =>
        prev.map((l) => (l.id === updated.id ? updated : l)),
      );
      setManagingLocation(updated);
      return { ok: true };
    }

    const res = await updateLocationDetailsAction({
      locationId: managingLocation.id,
      organizationId: selectedOrgId,
      name: data.name,
      timeZone: data.timeZone,
      address: data.address,
      coverWeight: data.coverWeight,
      openingLocal: data.openingLocal,
      closingLocal: data.closingLocal,
    });

    if (res.ok) {
      setManagingLocation(res.data);
      setReloadKey((k) => k + 1);
      return { ok: true };
    }

    return { ok: false, error: res.error, code: res.code };
  }

  // Edit operating hours submission handler
  async function handleSaveOperatingHours(hours: DayOperatingHours[]) {
    if (!managingLocation) return { ok: false, error: "No location selected." };

    if (demoMode) {
      setOperatingHours(hours);
      return { ok: true };
    }

    const res = await updateLocationOperatingHoursAction({
      locationId: managingLocation.id,
      organizationId: selectedOrgId,
      operatingHours: hours,
    });

    if (res.ok) {
      setOperatingHours(res.data);
      return { ok: true };
    }

    return { ok: false, error: res.error };
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="border-border flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="icon"
            onClick={onBack}
            disabled={modulesPending}
            aria-label="Back to Settings"
            className="shrink-0"
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
          <div>
            <h1 className="text-foreground text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
              Locations
            </h1>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Manage restaurant branches, addresses, time zones and operating
              hours.
            </p>
          </div>
        </div>

        {/* Organization Management Selector */}
        {organizations.length > 1 ? (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-muted-foreground text-xs font-medium whitespace-nowrap">
              Organization:
            </span>
            <Select
              disabled={modulesPending}
              value={selectedOrgId}
              onChange={(e) => handleSelectOrg(e.target.value)}
              className="h-9 min-h-9 w-48 text-xs font-medium"
              aria-label="Select organization to administer"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </Select>
          </div>
        ) : selectedOrg ? (
          <div className="border-border bg-muted/40 text-muted-foreground flex items-center gap-1.5 self-start rounded-xl border px-3 py-1.5 text-xs font-medium sm:self-auto">
            <Building2 className="text-primary size-3.5" aria-hidden="true" />
            <span>{selectedOrg.name}</span>
          </div>
        ) : null}
        {canAdminister && !loadingContext && selectedOrg ? (
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5 self-start sm:self-auto"
            onClick={() => setShowStaffOverview(true)}
          >
            <Users aria-hidden="true" />
            Staff Assignments
          </Button>
        ) : null}
      </div>

      {demoMode && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          Demo Mode — Location administration actions are preview-only and will
          not alter remote database records.
        </div>
      )}

      {/* Main Content Area */}
      {loadingContext ? (
        <Card className="text-muted-foreground p-8 text-center text-sm">
          Loading administration permissions...
        </Card>
      ) : !canAdminister ? (
        <Card className="border-destructive/30 bg-destructive/5 p-8 text-center">
          <h3 className="text-destructive text-base font-semibold">
            Management Authority Required
          </h3>
          <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
            You do not hold permissions to administer restaurant locations. Only
            Overall Managers, Overall Owners, or Organization Owners/General
            Managers are authorized to manage branch configurations.
          </p>
          <div className="mt-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={onBack}
              disabled={modulesPending}
            >
              Return to Settings
            </Button>
          </div>
        </Card>
      ) : loadingLocations ? (
        <div className="space-y-4">
          <div className="bg-muted/60 h-10 w-full max-w-md animate-pulse rounded-xl" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="border-border bg-muted/20 h-44 animate-pulse rounded-2xl border" />
            <div className="border-border bg-muted/20 h-44 animate-pulse rounded-2xl border" />
          </div>
        </div>
      ) : locationsError ? (
        <Card className="border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-destructive text-sm font-medium">
            {locationsError}
          </p>
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReloadKey((k) => k + 1)}
              className="gap-1.5"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Retry
            </Button>
          </div>
        </Card>
      ) : (
        <LocationList
          locations={locations}
          organizationName={selectedOrg?.name ?? "Restaurant"}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onManageLocation={(loc) => {
            setManagingLocation(loc);
            setManageTab(loc.archivedAt ? "modules" : "details");
          }}
          onAddLocation={() => setIsAddingLocation(true)}
          canManage={canAdminister}
          onLifecycleAction={(location, action) => {
            setLifecycleNotice(null);
            setLifecycleRequest({ location, action });
          }}
          onViewHistory={(location) => setHistoryLocation(location)}
        />
      )}

      {lifecycleNotice ? (
        <div
          role="status"
          data-testid="lifecycle-notice"
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-medium text-emerald-800 dark:text-emerald-300"
        >
          {lifecycleNotice}
        </div>
      ) : null}

      {/* Lifecycle confirmation (deactivate / reactivate / archive / restore) */}
      {lifecycleRequest && selectedOrg ? (
        <LocationLifecycleDialog
          key={`${lifecycleRequest.location.id}:${lifecycleRequest.action}`}
          source={lifecycleSource}
          organizationId={selectedOrgId}
          organizationName={selectedOrg.name}
          location={lifecycleRequest.location}
          action={lifecycleRequest.action}
          onClose={() => setLifecycleRequest(null)}
          onCompleted={(updated) =>
            handleLifecycleCompleted(updated, lifecycleRequest.action)
          }
          onStale={() => {
            setLifecycleRequest(null);
            setReloadKey((k) => k + 1);
          }}
        />
      ) : null}

      {historyLocation && selectedOrg ? (
        <LocationLifecycleHistoryDialog
          source={lifecycleSource}
          organizationId={selectedOrgId}
          organizationName={selectedOrg.name}
          location={historyLocation}
          onClose={() => setHistoryLocation(null)}
        />
      ) : null}

      {/* Create Location Dialog */}
      {isAddingLocation && (
        <Dialog
          open={isAddingLocation}
          onClose={() => setIsAddingLocation(false)}
          title="Add New Location"
          description={`Add a physical branch under ${selectedOrg?.name ?? "organization"}.`}
        >
          <LocationForm
            mode="create"
            organizationId={selectedOrgId}
            organizationName={selectedOrg?.name ?? "Restaurant"}
            onSubmit={handleCreateLocation}
            onCancel={() => setIsAddingLocation(false)}
          />
        </Dialog>
      )}

      {/* Manage Location Dialog */}
      {managingLocation && (
        <Dialog
          open={Boolean(managingLocation)}
          onClose={() => {
            if (!modulesPending) setManagingLocation(null);
          }}
          title={`Manage ${managingLocation.name}`}
          description={`Branch in ${selectedOrg?.name ?? "organization"} · ${managingLocation.timeZone}`}
          className="max-w-[min(94vw,40rem)]"
        >
          <div className="space-y-4">
            {/* View Switcher Tabs */}
            <div className="border-border flex flex-wrap border-b">
              <button
                type="button"
                disabled={modulesPending || !!managingLocation.archivedAt}
                onClick={() => setManageTab("details")}
                className={`-mb-px border-b-2 px-4 py-2 text-xs font-semibold transition ${
                  manageTab === "details"
                    ? "border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground border-transparent"
                }`}
              >
                Details
              </button>
              <button
                type="button"
                disabled={modulesPending || !!managingLocation.archivedAt}
                onClick={() => setManageTab("hours")}
                className={`-mb-px border-b-2 px-4 py-2 text-xs font-semibold transition ${
                  manageTab === "hours"
                    ? "border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground border-transparent"
                }`}
              >
                Hours
              </button>
              <button
                type="button"
                disabled={modulesPending || !!managingLocation.archivedAt}
                onClick={() => setManageTab("staff")}
                className={`-mb-px border-b-2 px-4 py-2 text-xs font-semibold transition ${
                  manageTab === "staff"
                    ? "border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground border-transparent"
                }`}
              >
                Staff
              </button>
              <Button
                variant="ghost"
                className="min-h-11"
                disabled={modulesPending || !!managingLocation.archivedAt}
                onClick={() => setManageTab("modules")}
              >
                Modules
              </Button>
            </div>
            <div hidden={manageTab !== "modules"}>
              <LocationModuleSettings
                key={managingLocation.id}
                location={managingLocation}
                source={moduleSource}
                demoMode={demoMode}
                onPendingChange={setModulesPending}
              />
            </div>

            {manageTab === "modules" ? null : manageTab === "details" ? (
              <LocationForm
                mode="edit"
                organizationId={selectedOrgId}
                organizationName={selectedOrg?.name ?? "Restaurant"}
                initialLocation={managingLocation}
                onSubmit={handleUpdateLocationDetails}
                onCancel={() => setManagingLocation(null)}
              />
            ) : manageTab === "staff" ? (
              <LocationStaffManagement
                source={staffSource}
                organizationId={selectedOrgId}
                organizationName={selectedOrg?.name ?? "Restaurant"}
                location={managingLocation}
                organizationLocations={locations.map((l) => ({
                  id: l.id,
                  name: l.name,
                  active: l.active,
                }))}
                canManage={canAdminister}
              />
            ) : loadingHours ? (
              <div className="text-muted-foreground py-8 text-center text-xs">
                Loading weekly hours...
              </div>
            ) : (
              <LocationOperatingHoursEditor
                initialHours={operatingHours}
                onSave={handleSaveOperatingHours}
                onCancel={() => setManagingLocation(null)}
              />
            )}
          </div>
        </Dialog>
      )}

      {/* Employee-centric Staff Assignments overview */}
      {showStaffOverview && selectedOrg && (
        <OrganizationStaffAssignments
          source={staffSource}
          organizationId={selectedOrgId}
          organizationName={selectedOrg.name}
          locations={locations.map((l) => ({
            id: l.id,
            name: l.name,
            active: l.active,
          }))}
          onClose={() => setShowStaffOverview(false)}
        />
      )}
    </div>
  );
}

"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Location } from "@/features/locations/domain/location";
import { CONFIGURABLE_MODULES } from "../domain/module-registry";
import {
  MODULE_SETTINGS_ERRORS,
  type ModuleEditorSnapshot,
  type ModuleSettingsSource,
  type SettingsFailure,
} from "../domain/module-settings";

export function LocationModuleSettings({
  location,
  source,
  demoMode = false,
  onPendingChange,
}: {
  location: Location;
  source: ModuleSettingsSource;
  demoMode?: boolean;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [snapshot, setSnapshot] = React.useState<ModuleEditorSnapshot | null>(
    null,
  );
  const [error, setError] = React.useState<SettingsFailure["code"] | null>(
    null,
  );
  const [reload, setReload] = React.useState(0);
  const [feedback, setFeedback] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState<string | null>(null);
  const busy = React.useRef(false);
  const [retry, setRetry] = React.useState<{
    key: (typeof CONFIGURABLE_MODULES)[number]["key"];
    enabled: boolean;
  } | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    source
      .read({
        locationId: location.id,
        organizationId: location.organizationId,
      })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setSnapshot(result.data);
          setError(null);
        } else setError(result.code);
      })
      .catch(() => {
        if (!cancelled) setError("unexpected");
      });
    return () => {
      cancelled = true;
    };
  }, [location.id, location.organizationId, source, reload]);

  async function save(
    key: (typeof CONFIGURABLE_MODULES)[number]["key"],
    enabled: boolean,
  ) {
    if (
      !snapshot ||
      busy.current ||
      snapshot.lifecycle === "archived" ||
      location.archivedAt
    )
      return;
    busy.current = true;
    setPending(key);
    onPendingChange?.(true);
    setFeedback((prev) => ({ ...prev, [key]: "Saving…" }));
    try {
      const result = await source.save({
        locationId: location.id,
        organizationId: location.organizationId,
        actorId: snapshot.actorId,
        moduleKey: key,
        isEnabled: enabled,
        expectedUpdatedAt:
          snapshot.configs.find((c) => c.moduleKey === key)?.updatedAt ?? null,
      });
      if (result.ok) {
        setSnapshot((prev) =>
          prev
            ? {
                ...prev,
                configs: [
                  ...prev.configs.filter((c) => c.moduleKey !== key),
                  result.data,
                ],
              }
            : prev,
        );
        setFeedback((prev) => ({
          ...prev,
          [key]: demoMode ? "Saved for this demo session" : "Saved",
        }));
        setRetry(null);
      } else {
        setFeedback((prev) => ({
          ...prev,
          [key]: MODULE_SETTINGS_ERRORS[result.code],
        }));
        setRetry({ key, enabled });
        if (
          ["conflict", "stale_identity", "archived", "unauthorized"].includes(
            result.code,
          )
        )
          setError(result.code);
      }
    } catch {
      setFeedback((prev) => ({
        ...prev,
        [key]: "Save failed. Retry your choice.",
      }));
      setRetry({ key, enabled });
    } finally {
      busy.current = false;
      setPending(null);
      onPendingChange?.(false);
    }
  }
  const lifecycle = location.archivedAt
    ? "archived"
    : demoMode
      ? location.active
        ? "active"
        : "inactive"
      : (snapshot?.lifecycle ?? (location.active ? "active" : "inactive"));
  return (
    <section aria-label="Location modules" className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">
          Location modules — {location.name}
        </h3>
        <Badge>{lifecycle}</Badge>
      </div>
      <p className="text-muted-foreground text-sm">
        Module navigation reflects saved location preferences. Backend operation
        enforcement is not yet active.
      </p>
      {demoMode && (
        <p className="text-sm">
          Demonstration only — choices last for this administration session.
        </p>
      )}
      {lifecycle === "archived" && (
        <p className="text-sm">
          Archived locations are read-only. Existing preferences are preserved.
        </p>
      )}
      {lifecycle === "inactive" && (
        <p className="text-sm">
          This location is inactive. You can prepare its module preferences.
        </p>
      )}
      {error ? (
        <div role="alert" className="space-y-2">
          <p>{MODULE_SETTINGS_ERRORS[error]}</p>
          <Button
            className="min-h-11"
            disabled={!!pending}
            onClick={() => {
              setSnapshot(null);
              setError(null);
              setRetry(null);
              setFeedback({});
              setReload((v) => v + 1);
            }}
          >
            Reload settings
          </Button>
        </div>
      ) : !snapshot ? (
        <p role="status">Loading module settings…</p>
      ) : (
        <ul className="divide-border divide-y">
          {CONFIGURABLE_MODULES.map((module) => {
            const config = snapshot.configs.find(
              (c) => c.moduleKey === module.key,
            );
            const label = config
              ? config.isEnabled
                ? "Enabled"
                : "Disabled"
              : "Not configured";
            return (
              <li
                key={module.key}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <h4 className="font-medium">{module.label}</h4>
                  <p className="text-muted-foreground text-sm">{label}</p>
                  <p role="status" className="text-sm">
                    {feedback[module.key]}
                  </p>
                </div>
                {lifecycle !== "archived" && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="min-h-11"
                      variant="outline"
                      aria-label={`Enable ${module.label}`}
                      disabled={!!pending}
                      onClick={() => void save(module.key, true)}
                    >
                      Enable
                    </Button>
                    <Button
                      className="min-h-11"
                      variant="outline"
                      aria-label={`Disable ${module.label}`}
                      disabled={!!pending}
                      onClick={() => void save(module.key, false)}
                    >
                      Disable
                    </Button>
                    {retry?.key === module.key && (
                      <Button
                        className="min-h-11"
                        disabled={!!pending}
                        onClick={() => void save(retry.key, retry.enabled)}
                      >
                        Retry {retry.enabled ? "enable" : "disable"}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-border border-t pt-3">
        <h4 className="font-medium">Settings</h4>
        <p className="text-muted-foreground text-sm">
          Always available · System required
        </p>
      </div>
    </section>
  );
}

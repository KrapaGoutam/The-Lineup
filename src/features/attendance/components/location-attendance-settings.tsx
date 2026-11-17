"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  getLocationAttendanceModeAction,
  setLocationAttendanceModeAction,
} from "../actions/attendance-mode-actions";
import {
  ATTENDANCE_MODES,
  getAttendanceModeLabel,
  type AttendanceMode,
} from "../domain/attendance-mode";
import type { LocationAttendanceModeRecord } from "../data/attendance-mode-data";

const modeDescriptions: Record<AttendanceMode, string> = {
  INTERNAL_THE_LINEUP:
    "Clocking uses The Lineup's internal attendance. Kiosk clocking requires an authorized registered device; selecting this mode does not register one.",
  EXTERNAL:
    "Attendance uses the configured external provider. Selecting this mode does not set up an external integration.",
  DISABLED:
    "New attendance tracking is disabled. Historical attendance records are preserved.",
};

export function LocationAttendanceSettings({
  locationId,
  locationName,
}: {
  readonly locationId: string;
  readonly locationName: string;
}) {
  const [record, setRecord] =
    React.useState<LocationAttendanceModeRecord | null>(null);
  const [mode, setMode] = React.useState<AttendanceMode>("INTERNAL_THE_LINEUP");
  const [reason, setReason] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const result = await getLocationAttendanceModeAction(locationId);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setRecord(result.data);
    setMode(result.data.mode);
    setReason("");
    return true;
  }, [locationId]);

  React.useEffect(() => {
    let active = true;
    void getLocationAttendanceModeAction(locationId)
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          setRecord(result.data);
          setMode(result.data.mode);
        } else {
          setError(result.error);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError("Unable to load attendance settings.");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [locationId]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!record || saving) return;
    setError(null);
    setNotice(null);
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 3) {
      setError("Enter a reason of at least 3 characters.");
      return;
    }
    setSaving(true);
    try {
      const result = await setLocationAttendanceModeAction({
        locationId,
        mode,
        expectedUpdatedAt: record.updatedAt,
        reason: trimmedReason,
      });
      if (!result.ok) {
        if (result.code === "conflict") {
          const refreshed = await refresh();
          setError(
            refreshed
              ? "Another administrator changed this branch. The latest setting is shown; review it before saving again."
              : "Another administrator changed this branch. Reload the settings before saving again.",
          );
        } else {
          setError(result.error);
        }
        return;
      }
      if (await refresh()) {
        setError(null);
        setNotice("Attendance settings saved.");
      } else {
        setError(
          "Saved, but the current setting could not be refreshed. Retry before making another change.",
        );
      }
    } catch {
      setError("Unable to save attendance settings. Please retry.");
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <p role="status" className="text-muted-foreground py-6 text-sm">
        Loading attendance settings…
      </p>
    );

  if (!record) {
    return (
      <div className="space-y-3 py-3">
        <p role="alert" className="text-destructive text-sm">
          {error ?? "Attendance settings are unavailable or access was denied."}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setLoading(true);
            setError(null);
            void refresh()
              .catch(() => setError("Unable to load attendance settings."))
              .finally(() => setLoading(false));
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  const changed = mode !== record.mode || !record.isConfigured;
  return (
    <form
      onSubmit={(event) => void handleSave(event)}
      className="space-y-5 py-2"
    >
      <div className="space-y-1">
        <h3 className="text-foreground text-base font-semibold">
          Attendance Settings
        </h3>
        <p className="text-muted-foreground text-sm">
          Branch:{" "}
          <span className="text-foreground font-medium">{locationName}</span>
        </p>
        <p className="text-muted-foreground text-sm">
          Current effective mode:{" "}
          <span className="text-foreground font-medium">
            {getAttendanceModeLabel(record.mode)}
          </span>
          {record.isConfigured
            ? " · Configured"
            : " · Unconfigured (legacy external-compatible reads; internal clocking denied)"}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="attendance-mode">Attendance mode</Label>
        <Select
          id="attendance-mode"
          value={mode}
          onChange={(event) => {
            setMode(event.target.value as AttendanceMode);
            setNotice(null);
          }}
          disabled={saving}
        >
          {ATTENDANCE_MODES.map((value) => (
            <option key={value} value={value}>
              {getAttendanceModeLabel(value)}
            </option>
          ))}
        </Select>
        <p className="text-muted-foreground text-sm">
          {modeDescriptions[mode]}
        </p>
      </div>

      {changed ? (
        <div className="space-y-2">
          <Label htmlFor="attendance-reason">Reason for change</Label>
          <Input
            id="attendance-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={3}
            maxLength={500}
            required
            disabled={saving}
            placeholder="Why is this branch's attendance mode changing?"
          />
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="text-sm text-emerald-700 dark:text-emerald-300"
        >
          {notice}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!changed || saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={saving || (!changed && !reason)}
          onClick={() => {
            setMode(record.mode);
            setReason("");
            setError(null);
            setNotice(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

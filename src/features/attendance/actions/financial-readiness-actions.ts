"use server";

import { z } from "zod";

import { getPrimaryLocation } from "@/features/locations/data/primary-location";
import { guardModule } from "@/features/modules/data/module-enforcement";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";

import { getAttendanceEntryUser } from "../data/attendance-actor";
import { readNativeFinancialAttendance } from "../data/native-financial-data";
import {
  evaluateFinancialActivation,
  resolveFinancialSource,
  summarizeFinancialReadiness,
  type AttendanceConfigState,
  type FinancialActivation,
  type FinancialReadiness,
} from "../domain/financial-source";

export type ActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly error: string;
      readonly code?: "access_denied" | "source_error";
      readonly sessionInvalid?: true;
      readonly moduleUnavailable?: true;
      readonly contextStale?: true;
    };

/**
 * What a manager sees. `previewOnly` is a literal: this view never feeds Payroll or Tips,
 * creates no payroll period and no adjustment, and computes no money.
 */
export type FinancialReadinessView =
  | {
      readonly kind: "NATIVE";
      readonly previewOnly: true;
      readonly state: "INTERNAL_THE_LINEUP";
      readonly activation: FinancialActivation;
      readonly readiness: FinancialReadiness;
      readonly timeZone: string;
      readonly period: { readonly startDate: string; readonly endDate: string };
    }
  | {
      /** The existing external reader and its Payroll/Tips paths are unchanged and not read here. */
      readonly kind: "EXTERNAL_UNCHANGED";
      readonly previewOnly: true;
      readonly state: Extract<
        AttendanceConfigState,
        "EXTERNAL" | "UNCONFIGURED"
      >;
      readonly activation: FinancialActivation;
    }
  | {
      readonly kind: "DISABLED";
      readonly previewOnly: true;
      readonly state: "DISABLED";
      readonly activation: FinancialActivation;
    };

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const MAX_RANGE_DAYS = 92;

const inputSchema = z
  .object({
    restaurantSlug: slugSchema,
    startDate: z.iso.date(),
    endDate: z.iso.date(),
  })
  .refine(({ startDate, endDate }) => startDate <= endDate)
  .refine(({ startDate, endDate }) => {
    const days =
      (Date.parse(`${endDate}T00:00:00Z`) -
        Date.parse(`${startDate}T00:00:00Z`)) /
      86_400_000;
    return days <= MAX_RANGE_DAYS;
  });

/**
 * V2-006.006 — read-only "is this location's attendance ready to be used for payroll?"
 * preview for the VERIFIED location and a service-date range.
 *
 * - Identity and location are server-verified (canonical context + persisted location); the
 *   request names neither. The `attendance` module guard applies to that same location.
 * - Native records are read through `readNativeFinancialAttendance`, which checks management
 *   authority before reading, so a caller without it gets `access_denied`, never an empty
 *   readiness.
 * - External / unconfigured locations are NOT read here: the Neon reader has no organization
 *   or location scoping, so no new access path to it is introduced. Their existing reports
 *   and Payroll/Tips paths are unchanged.
 * - Nothing is written. Native attendance stays policy-blocked as a financial source until
 *   owner decisions Q1, Q4 and Q6 are approved; this view reports that state.
 */
export async function getAttendanceFinancialReadinessAction(input: {
  restaurantSlug: string;
  startDate: string;
  endDate: string;
}): Promise<ActionResult<FinancialReadinessView>> {
  try {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "That attendance request is invalid." };
    }

    const supabase = await createClient();
    const invalid = await requireLiveSession(supabase);
    if (invalid) return invalid;

    const user = await getAttendanceEntryUser(parsed.data.restaurantSlug);
    if (!user) {
      return { ok: false, error: "You need to sign in to see attendance." };
    }

    const location = await getPrimaryLocation(user.organizationId);
    if (!location) {
      return {
        ok: false,
        error:
          "Choose a location first. Attendance is shown for one location at a time.",
        contextStale: true,
      };
    }

    const blocked = await guardModule({
      module: "attendance",
      organizationId: user.organizationId,
      location,
    });
    if (blocked) return blocked;

    const { data: row, error: rowError } = await supabase
      .from("locations")
      .select("attendance_mode, time_zone")
      .eq("id", location.id)
      .maybeSingle();
    if (rowError || !row) {
      return { ok: false, error: "Unable to read this location." };
    }

    const decision = resolveFinancialSource(row.attendance_mode);
    const activation = evaluateFinancialActivation(decision);

    if (decision.state === "DISABLED") {
      return {
        ok: true,
        data: {
          kind: "DISABLED",
          previewOnly: true,
          state: "DISABLED",
          activation,
        },
      };
    }
    if (decision.state === "EXTERNAL" || decision.state === "UNCONFIGURED") {
      return {
        ok: true,
        data: {
          kind: "EXTERNAL_UNCHANGED",
          previewOnly: true,
          state: decision.state,
          activation,
        },
      };
    }

    const period = {
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
    };
    const result = await readNativeFinancialAttendance(supabase, {
      organizationId: user.organizationId,
      locationId: location.id,
      timeZone: row.time_zone,
      period,
    });

    if (result.status === "ACCESS_DENIED") {
      return {
        ok: false,
        code: "access_denied",
        error: "You don't have access to payroll readiness for this location.",
      };
    }
    if (result.status !== "OK") {
      return {
        ok: false,
        code: "source_error",
        error: "Attendance data unavailable. Try again.",
      };
    }

    return {
      ok: true,
      data: {
        kind: "NATIVE",
        previewOnly: true,
        state: "INTERNAL_THE_LINEUP",
        activation,
        readiness: summarizeFinancialReadiness(
          result.source,
          result.records,
          result.truncated,
        ),
        timeZone: row.time_zone,
        period,
      },
    };
  } catch (err: unknown) {
    console.error(
      "getAttendanceFinancialReadinessAction unexpected error",
      err,
    );
    return { ok: false, error: "Attendance data unavailable. Try again." };
  }
}

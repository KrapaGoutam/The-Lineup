import "server-only";

import { decideReportSource } from "@/features/attendance/domain/attendance-source";
import {
  readAll,
  STOCK_COLUMNS,
} from "@/features/bar-inventory/data/catalog-data";
import {
  getPayrollBalancesForPeriods,
  listPayrollPeriods,
} from "@/features/payroll/data/payroll-data";
import { normalizePeriodMonth } from "@/features/payroll/domain/calculate-payroll";
import {
  buildTipsRange,
  type TipsRange,
} from "@/features/tips/domain/tips-range-model";
import {
  classifyTipsReadError,
  TIPS_UNAVAILABLE_MESSAGES,
} from "@/features/tips/domain/tips-read-model";
import type { createClient } from "@/lib/supabase/server";

import {
  summarizeLowStock,
  summarizeOpenSessions,
  summarizePayroll,
  summarizeTipsToday,
  type AttendanceCard,
  type CardResult,
  type LowStockCard,
  type PayrollCard,
  type StockLevelInput,
  type StockProductInput,
  type TipsCard,
} from "../domain/dashboard-model";

/**
 * V2.0.9 — read-only KPI adapters. Each takes ids that the caller has ALREADY verified
 * (organization, location, profile come from the canonical active context, never from
 * the request) and returns a card result. Nothing here writes, nothing here decides who
 * may see a card; that is `getDashboardAction`'s job, done before any of these run.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

const ROW_CAP = 1000;

const unavailable = <T>(reason: string): CardResult<T> => ({
  status: "unavailable",
  reason,
});

/** A failed read never becomes a number. */
async function safely<T>(
  label: string,
  read: () => Promise<CardResult<T>>,
): Promise<CardResult<T>> {
  try {
    return await read();
  } catch (error) {
    console.error(`dashboard ${label} failed`, error);
    return unavailable<T>("Couldn't load this right now.");
  }
}

// ── Attendance ─────────────────────────────────────────────────────────────────────────

/**
 * The branch's attendance source. A database that predates the column is a legacy database
 * (external by definition); any other failure is "unknown", never a guess.
 */
async function readAttendanceSource(
  supabase: Supabase,
  locationId: string,
): Promise<ReturnType<typeof decideReportSource> | null> {
  const location = await supabase
    .from("locations")
    .select("attendance_mode")
    .eq("id", locationId)
    .maybeSingle();
  const legacy = location.error?.code === "42703";
  if ((location.error && !legacy) || (!location.error && !location.data)) {
    return null;
  }
  return decideReportSource(
    legacy ? null : (location.data?.attendance_mode ?? null),
  );
}

export function readAttendanceCard(
  supabase: Supabase,
  input: { organizationId: string; locationId: string },
): Promise<CardResult<AttendanceCard>> {
  return safely<AttendanceCard>("attendance", async () => {
    const source = await readAttendanceSource(supabase, input.locationId);
    if (!source) {
      return unavailable("Couldn't confirm this branch's attendance source.");
    }

    if (source.source === "disabled") {
      return unavailable("Attendance tracking is off for this branch.");
    }
    if (source.source !== "internal") {
      // The external time clock identifies people, not branches, so a branch headcount
      // from it cannot be proven. Never invent one.
      return unavailable(
        source.source === "unconfigured"
          ? "This branch hasn't chosen an attendance source, and the existing time clock doesn't report by branch."
          : "This branch uses an external time clock that doesn't report by branch.",
      );
    }

    const { data, error } = await supabase
      .from("attendance_session_summaries")
      .select("profile_id, status")
      .eq("organization_id", input.organizationId)
      .eq("location_id", input.locationId)
      .in("status", ["active", "on_break"])
      .limit(ROW_CAP);
    if (error || !data) {
      console.error("dashboard attendance read failed", { code: error?.code });
      return unavailable("Couldn't load attendance right now.");
    }
    if (data.length >= ROW_CAP) {
      return unavailable("Too many open sessions to count reliably.");
    }
    return {
      status: "ok",
      data: summarizeOpenSessions(data, source.label),
    };
  });
}

// ── Payroll ────────────────────────────────────────────────────────────────────────────

export function readPayrollCard(
  supabase: Supabase,
  input: { organizationId: string; locationId: string; serviceDate: string },
): Promise<CardResult<PayrollCard>> {
  return safely<PayrollCard>("payroll", async () => {
    // Internal-attendance branches generate native periods that carry no branch column and
    // have no list reader yet, so this card could only ever show an unproven zero for them.
    const source = await readAttendanceSource(supabase, input.locationId);
    if (!source) {
      return unavailable("Couldn't confirm this branch's payroll source.");
    }
    if (source.source === "internal") {
      return unavailable(
        "Payroll for this branch's internal attendance isn't summarized here yet. Open Payroll.",
      );
    }
    // Only this branch's periods. Legacy periods with no branch are never pulled in:
    // widening the figure to other branches would be an invented number.
    const periods = await listPayrollPeriods(supabase, {
      organizationId: input.organizationId,
      locationId: input.locationId,
    });
    if (!periods.ok) return unavailable("Couldn't load payroll right now.");
    if (periods.data.length >= ROW_CAP) {
      return unavailable("Too many payroll periods to total reliably.");
    }
    const balances = await getPayrollBalancesForPeriods(supabase, {
      periods: periods.data,
    });
    if (!balances.ok) return unavailable("Couldn't total payroll right now.");

    const withBalance = periods.data.map((period) => ({
      periodMonth: period.periodMonth,
      status: period.status,
      grossCents: period.grossCents,
      balanceCents: balances.data.get(period.id)?.balanceCents ?? 0,
    }));
    return {
      status: "ok",
      data: summarizePayroll(
        withBalance,
        normalizePeriodMonth(input.serviceDate),
      ),
    };
  });
}

// ── Tips ───────────────────────────────────────────────────────────────────────────────

export function readTipsCard(
  supabase: Supabase,
  input: {
    organizationId: string;
    locationId: string;
    serviceDate: string;
    profileId: string;
  },
): Promise<CardResult<TipsCard>> {
  return safely<TipsCard>("tips", async () => {
    // The V2.0.8 range contract. The database decides what this caller may see:
    // managers get the location's intervals, staff only their own shares.
    const { data, error } = await supabase.rpc("tips_get_range", {
      p_organization_id: input.organizationId,
      p_location_id: input.locationId,
      p_from: input.serviceDate,
      p_to: input.serviceDate,
      p_include_revisions: false,
    });
    if (error) {
      return unavailable(
        TIPS_UNAVAILABLE_MESSAGES[classifyTipsReadError(error)],
      );
    }
    const range: TipsRange | null = buildTipsRange(data);
    if (!range)
      return unavailable("Tips data came back in an unexpected form.");
    return {
      status: "ok",
      data: summarizeTipsToday(range, input.serviceDate, input.profileId),
    };
  });
}

// ── Low stock ──────────────────────────────────────────────────────────────────────────

export function readLowStockCard(
  supabase: Supabase,
  input: { organizationId: string; locationId: string; timeZone: string },
): Promise<CardResult<LowStockCard>> {
  return safely<LowStockCard>("low stock", async () => {
    // Plain reads: the catalog snapshot also bootstraps (writes) the Unassigned vendor,
    // which a dashboard must never do.
    const [products, stock] = await Promise.all([
      readAll<StockProductInput>(
        supabase,
        "inventory_products",
        "id, active",
        input.organizationId,
      ),
      readAll<StockLevelInput>(
        supabase,
        "inventory_stock",
        STOCK_COLUMNS,
        input.organizationId,
        { orderBy: "product_id", locationId: input.locationId },
      ),
    ]);
    if (!products || !stock) {
      return unavailable("Couldn't load inventory right now.");
    }
    return {
      status: "ok",
      data: summarizeLowStock(products, stock, input.timeZone, new Date()),
    };
  });
}

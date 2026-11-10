import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.generated";

import {
  correctNativeAttendanceSession,
  getSessionHistory,
  mapCorrectionError,
  mapHistoryRow,
} from "./native-correction-data";
import { correctionInputSchema } from "../domain/attendance-correction";

vi.mock("server-only", () => ({}));

const SESSION = "00000000-0000-0000-0000-00000000aaaa";

describe("mapCorrectionError", () => {
  it("maps every database failure to a stable code", () => {
    expect(mapCorrectionError({ code: "42501" }).code).toBe("unauthorized");
    expect(mapCorrectionError({ code: "P0004" }).code).toBe("stale");
    expect(mapCorrectionError({ code: "55000" }).code).toBe("voided");
    expect(mapCorrectionError({ code: "23P01" }).code).toBe("overlap");
    expect(
      mapCorrectionError({ code: "22023", message: "Breaks cannot overlap" }),
    ).toEqual({
      code: "invalid",
      error: "Breaks cannot overlap",
    });
    expect(mapCorrectionError({ code: "22007" }).code).toBe("invalid");
    expect(
      mapCorrectionError({ code: "XX000", message: "secret internals" }),
    ).toEqual({
      code: "unexpected",
      error: "The correction could not be saved.",
    });
  });

  it("never reveals whether a session exists for an unauthorized caller", () => {
    expect(
      mapCorrectionError({ code: "42501", message: "Unauthorized" }).error,
    ).toBe("You can't correct this attendance record.");
  });
});

describe("correctNativeAttendanceSession", () => {
  it("passes snake_case parameters and omits unset break fields", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        success: true,
        idempotent: false,
        sessionId: SESSION,
        eventId: 5,
        correctionSeq: 1,
        version: 2,
      },
      error: null,
    });
    const input = correctionInputSchema.parse({
      sessionId: SESSION,
      expectedVersion: 1,
      reason: "Forgot to clock out",
      clockOutAt: "2026-11-09T19:00:00Z",
      breaks: [{ id: 7, payClassification: "unpaid" }],
      idempotencyKey: "k1",
    });

    const res = await correctNativeAttendanceSession(
      { rpc } as unknown as SupabaseClient<Database>,
      input,
    );

    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("attendance_correct_session", {
      p_session_id: SESSION,
      p_expected_version: 1,
      p_reason: "Forgot to clock out",
      p_clock_in_at: undefined,
      p_clock_out_at: "2026-11-09T19:00:00Z",
      p_breaks: [{ id: 7, pay_classification: "unpaid" }],
      p_void: false,
      p_idempotency_key: "k1",
    });
  });

  it("returns a stale conflict without throwing", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "P0004", message: "x" },
    });
    const res = await correctNativeAttendanceSession(
      { rpc } as unknown as SupabaseClient<Database>,
      correctionInputSchema.parse({
        sessionId: SESSION,
        expectedVersion: 1,
        reason: "reason",
        void: true,
      }),
    );
    expect(res).toMatchObject({ ok: false, code: "stale" });
  });

  it("converts a thrown error into a controlled failure", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("network"));
    const res = await correctNativeAttendanceSession(
      { rpc } as unknown as SupabaseClient<Database>,
      correctionInputSchema.parse({
        sessionId: SESSION,
        expectedVersion: 1,
        reason: "reason",
        void: true,
      }),
    );
    expect(res).toMatchObject({ ok: false, code: "unexpected" });
  });
});

describe("history mapping", () => {
  const base = {
    id: 1,
    event_type: "manager_edit" as const,
    event_time: "2026-11-09T20:00:00Z",
    source: "manager" as const,
    actor_profile_id: "p1",
    is_manager_correction: true,
    correction_reason: "Fix",
  };

  it("extracts sequence, changed fields and before/after from metadata", () => {
    const e = mapHistoryRow({
      ...base,
      metadata: {
        seq: 3,
        changed_fields: ["clock_out_at", 7],
        self_correction: true,
        before: { clock_out_at: "a" },
        after: { clock_out_at: "b" },
      },
    });
    expect(e).toMatchObject({
      isCorrection: true,
      correctionSeq: 3,
      changedFields: ["clock_out_at"],
      selfCorrection: true,
      before: { clock_out_at: "a" },
      after: { clock_out_at: "b" },
    });
  });

  it("tolerates malformed metadata", () => {
    const e = mapHistoryRow({ ...base, metadata: "nope" as unknown as never });
    expect(e.correctionSeq).toBeNull();
    expect(e.changedFields).toEqual([]);
    expect(e.before).toBeNull();
  });

  it("reads history oldest-first from the events table", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [
        {
          ...base,
          id: 1,
          event_type: "clock_in",
          is_manager_correction: false,
          correction_reason: null,
          metadata: {},
        },
        { ...base, id: 2, metadata: { seq: 1 } },
      ],
      error: null,
    });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const res = await getSessionHistory(
      { from } as unknown as SupabaseClient<Database>,
      SESSION,
    );
    expect(from).toHaveBeenCalledWith("attendance_events");
    expect(eq).toHaveBeenCalledWith("session_id", SESSION);
    expect(order).toHaveBeenCalledWith("id", { ascending: true });
    expect(res.ok && res.data.map((h) => h.isCorrection)).toEqual([
      false,
      true,
    ]);
  });
});

import type { TipsRange } from "@/features/tips/domain/tips-range-model";
import type { TeamMember } from "@/lib/demo-data";

export type TipsApiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      conflict?: true;
      contextStale?: true;
      sessionInvalid?: true;
    };

export type SaveIntervalValues = {
  serviceDate: string;
  /** Present = Update that interval. Absent = Save a new one. */
  intervalId?: string;
  expectedRevision?: number;
  start: string;
  end: string;
  cashCents: number;
  cardCents: number;
  participantIds: string[];
  /** Required when updating. */
  reason?: string;
};

export type LoadedRange = {
  range: TipsRange;
  /** Present when the roster was re-read (real mode). */
  team?: TeamMember[];
  selectableIds?: string[];
};

/**
 * Everything the Tips screen can ask of the backend. Real mode implements it with the
 * server actions (tenancy, authorization and audit are enforced there and in the
 * database); demo mode with an in-memory store that follows the same rules.
 */
export type TipsApi = {
  saveInterval(
    values: SaveIntervalValues,
  ): Promise<
    TipsApiResult<{ intervalId: number; tipPoolId: number; revision: number }>
  >;
  voidInterval(values: {
    intervalId: string;
    expectedRevision: number;
    reason: string;
  }): Promise<TipsApiResult<null>>;
  /** Re-derive a SAVED day's allocations from its saved intervals and participants. */
  recalculate(tipPoolId: number): Promise<TipsApiResult<{ changed: boolean }>>;
  loadRange(input: {
    from: string;
    to: string;
    includeRevisions: boolean;
  }): Promise<TipsApiResult<LoadedRange>>;
  /** A roster SUGGESTION from attendance; never a write. */
  pullClockedIn(): Promise<TipsApiResult<string[]>>;
  /** Audited correction of a day locked by the earlier Finalize workflow. */
  reopenLegacy(tipPoolId: number, reason: string): Promise<TipsApiResult<null>>;
};

/**
 * `schedule_periods.published_version` is unique per
 * `(location_id, starts_on, ends_on)` — not per row (see
 * `supabase/migrations/20260905065702_initial_schema.sql`'s
 * `unique (location_id, starts_on, ends_on, published_version)`). Feature
 * 015 Phase B's simplified model creates a fresh draft row whenever the
 * previous one for that location/year has already been published, and
 * every new row starts at `published_version = 0` (the schema default).
 *
 * Publishing must not increment that row's own value in isolation --
 * `getOrCreateDraftPeriod` always hands back a row starting at 0, so a
 * naive `draft.published_version + 1` produces `1` on every single
 * publish, colliding with whatever version the previous published period
 * for the same location/year already claimed. The next version has to be
 * the next one in the sequence across every period that has ever occupied
 * this `(location_id, starts_on, ends_on)`, published or not.
 */
export function nextPublishedVersion(existingVersions: number[]): number {
  return Math.max(0, ...existingVersions) + 1;
}

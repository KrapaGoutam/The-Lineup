import { describe, expect, it } from "vitest";

import {
  applyDomainStep,
  newDomainBoard,
  projectViews,
} from "@/features/allocation/testing/cross-view-matrix";
import {
  SCENARIOS,
  checkViews,
  watchedTables,
} from "@/features/allocation/testing/cross-view-scenarios";

/**
 * X4 domain layer: every scenario of the shared matrix through the pure
 * reducer + shared claim classifier + read model, asserting Grid, Floor,
 * Picker, Servers and Dashboard against ONE canonical expectation -- after the
 * scenario and after every checkpoint step.
 */
describe("cross-view scenario matrix (domain)", () => {
  it("has unique ids and covers every supported origin and action", () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const steps = SCENARIOS.flatMap((s) => s.steps);
    const origins = new Set(
      steps.flatMap((step) => ("via" in step ? [step.via] : [])),
    );
    expect([...origins].sort()).toEqual(["floor", "grid", "picker", "servers"]);
    const actions = new Set(steps.map((step) => step.do));
    for (const action of [
      "assign",
      "conflict",
      "same-server",
      "repeat",
      "end",
      "transfer",
      "unassign",
      "skip",
      "undo",
      "redo",
    ]) {
      expect(actions.has(action as never)).toBe(true);
    }
  });

  for (const scenario of SCENARIOS) {
    it(`${scenario.id}: ${scenario.title}`, () => {
      const watched = watchedTables(scenario);
      let history = newDomainBoard();
      for (const [index, step] of scenario.steps.entries()) {
        history = applyDomainStep(history, step);
        if (step.then) {
          const { views } = projectViews(history.present, watched);
          expect(
            checkViews(views, step.then),
            `after step ${index + 1} (${step.do})`,
          ).toEqual([]);
        }
      }
      const { views, model } = projectViews(history.present, watched);
      expect(checkViews(views, scenario.expect)).toEqual([]);

      // Whatever the scenario did: one active owner per physical table, and
      // the Servers sum is the Dashboard count (no view-specific arithmetic).
      const owners = new Map<string, number>();
      for (const server of model.servers) {
        for (const label of server.activeTableLabels) {
          owners.set(label, (owners.get(label) ?? 0) + 1);
        }
      }
      expect([...owners.values()].every((n) => n === 1)).toBe(true);
      expect(
        model.servers.reduce((n, s) => n + s.activeTableLabels.length, 0),
      ).toBe(model.stats.occupiedTables);
      // Ended history never counts as active. A table may be ended AND held
      // again, by anyone including the same server (#166: a later turn), but
      // it is held at most once -- the owners check above -- and an ended
      // entry adds nothing to the active count (the sum check above).
    });
  }
});

import { test } from "@playwright/test";

import { SCENARIOS } from "../../src/features/allocation/testing/cross-view-scenarios";
import { runScenario } from "./support/allocation-ui";

/**
 * X4: the automated cross-view matrix. Every scenario in the shared,
 * machine-readable list is driven through the real UI of the origin it names
 * (Grid, Floor, Picker, Servers) and then asserted across ALL five views --
 * Grid, Floor, Picker, Servers, Dashboard -- against one canonical
 * expectation, on desktop, tablet and mobile (see playwright.config.ts
 * projects). The same scenarios run in the domain layer
 * (src/features/allocation/testing/cross-view-matrix.test.ts).
 */
for (const scenario of SCENARIOS) {
  test(`${scenario.id}: ${scenario.title}`, async ({ page }) => {
    await runScenario(page, scenario);
  });
}

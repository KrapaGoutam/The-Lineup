import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * V2-004.004 — completeness guard for the Server Action layer.
 *
 * Every exported Server Action under src/features/<feature>/actions must be
 * classified. A future action that is neither guarded nor on the reasoned
 * exemption list fails this test, so a new operational path cannot silently
 * ship outside module enforcement.
 */

const SRC = path.resolve(import.meta.dirname, "../..");

function actionFiles(): string[] {
  const features = path.join(SRC, "features");
  return fs.readdirSync(features).flatMap((feature) => {
    const dir = path.join(features, feature, "actions");
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".ts") && !name.includes(".test."))
      .map((name) => path.join(dir, name));
  });
}

/** Platform / system-required operations: never gated by an optional module. */
const EXEMPT_FILES: Record<string, string> = {
  "context/actions/context-actions.ts":
    "organization/location context switching is platform plumbing",
  "attendance/actions/attendance-mode-actions.ts":
    "Settings: attendance source configuration is location administration; it must work while the attendance module is off so an owner can turn it on (authority is enforced by set_location_attendance_mode)",
  "locations/actions/location-admin-actions.ts":
    "Settings: location administration (system-required module)",
  "locations/actions/location-lifecycle-actions.ts":
    "Settings: location lifecycle (system-required module)",
  "locations/actions/staff-assignment-actions.ts":
    "Settings: staff assignment administration (system-required module)",
  "modules/actions/module-config-actions.ts":
    "Settings: module configuration management (system-required module)",
  "settings/actions/account-recovery-actions.ts":
    "Settings: authorized account recovery must work with Team disabled",
  "kiosk/actions/kiosk-admin-actions.ts":
    "Settings: kiosk device administration is location administration (system-required module)",
  "kiosk/actions/kiosk-pairing-actions.ts":
    "Kiosk: tablet device pairing and status checks are hardware registration plumbing",
  "kiosk/actions/kiosk-clock-actions.ts":
    "Kiosk: tablet PIN clock actions authenticate via kiosk device token and enforce location internal attendance mode directly",
};

const EXEMPT_ACTIONS: Record<string, string> = {
  "tasks/actions/tasks-actions.ts:acknowledgeOpeningReminderAction":
    "Own-recipient read-state recovery; SQL validates live identity, never task state or another recipient",
};

/**
 * Helpers that carry the guard for every action that calls them. The test
 * also asserts the helper itself calls the guard.
 */
const GUARDING_HELPERS: Record<
  string,
  { helper: string; module: string; guardIn?: string }[]
> = {
  "bar-inventory/actions/inventory-actions.ts": [
    { helper: "resolveManager(", module: "bar_inventory" },
  ],
  "bar-inventory/actions/import-actions.ts": [
    { helper: "caller(", module: "bar_inventory", guardIn: "resolveManager" },
  ],
  "bar-inventory/actions/order-draft-actions.ts": [
    { helper: "resolveCaller(", module: "bar_inventory" },
  ],
  "recipes/actions/recipe-management-actions.ts": [
    { helper: "context(", module: "recipes" },
  ],
  "recipes/actions/recipe-image-actions.ts": [
    { helper: "context(", module: "recipes" },
  ],
  "attendance/actions/native-report-actions.ts": [
    { helper: "resolveContext(", module: "attendance" },
  ],
  "payroll/actions/payroll-actions.ts": [
    { helper: "guardPayrollModule(", module: "payroll" },
  ],
  "payroll/actions/native-payroll-actions.ts": [
    { helper: "authorize(", module: "payroll" },
  ],
};

function exportedActions(text: string): { name: string; body: string }[] {
  const pattern = /^export async function (\w+)/gm;
  const found: { name: string; index: number }[] = [];
  for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
    found.push({ name: m[1], index: m.index });
  }
  return found.map((entry, i) => ({
    name: entry.name,
    body: text.slice(entry.index, found[i + 1]?.index ?? text.length),
  }));
}

const GUARD_CALL = /guardModule(ForSlug)?\(/;

describe("every Server Action is module-guarded or explicitly exempt (BE-21…BE-29)", () => {
  const files = actionFiles();

  it("finds the action groups named in the V2-004.004 inventory", () => {
    const rel = files.map((f) =>
      path.relative(path.join(SRC, "features"), f).split(path.sep).join("/"),
    );
    for (const expected of [
      "allocation/actions/allocation-actions.ts",
      "tasks/actions/tasks-actions.ts",
      "tips/actions/tips-actions.ts",
      "schedules/actions/schedule-actions.ts",
      "attendance/actions/attendance-actions.ts",
      "payroll/actions/payroll-actions.ts",
      "payroll/actions/statement-actions.ts",
      "bar-inventory/actions/inventory-actions.ts",
      "recipes/actions/recipe-actions.ts",
      "team/actions/team-actions.ts",
    ]) {
      expect(rel).toContain(expected);
    }
  });

  for (const file of files) {
    const rel = path
      .relative(path.join(SRC, "features"), file)
      .split(path.sep)
      .join("/");
    if (EXEMPT_FILES[rel]) continue;

    it(`${rel}: every exported action calls the module guard`, () => {
      const text = fs.readFileSync(file, "utf8");
      const actions = exportedActions(text);
      expect(actions.length).toBeGreaterThan(0);

      const helpers = GUARDING_HELPERS[rel] ?? [];
      for (const { helper, guardIn } of helpers) {
        // The function that holds the guard (the helper, or the one it calls)
        // must contain the guard call.
        const name = guardIn ?? helper.replace("(", "");
        const start = text.search(new RegExp(`(?:async )?function ${name}\\(`));
        expect(start, `${rel}: helper ${name} exists`).toBeGreaterThan(-1);
        const helperBody = text.slice(start, start + 2500);
        expect(helperBody, `${rel}: helper ${name} guards`).toMatch(GUARD_CALL);
      }

      const unguarded = actions
        .filter(
          ({ name, body }) =>
            !EXEMPT_ACTIONS[`${rel}:${name}`] &&
            !GUARD_CALL.test(body) &&
            !helpers.some(({ helper }) => body.includes(helper)),
        )
        .map(({ name }) => name);
      expect(unguarded).toEqual([]);
    });
  }

  it("the exemption list names only files that exist", () => {
    for (const rel of Object.keys(EXEMPT_FILES)) {
      expect(fs.existsSync(path.join(SRC, "features", rel)), rel).toBe(true);
    }
  });

  it("every guarded action file names its module key from the registry", () => {
    const valid = new Set([
      "table_allocation",
      "tasks",
      "schedule",
      "tips",
      "team",
      "attendance",
      "payroll",
      "bar_inventory",
      "recipes",
    ]);
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      for (const m of text.matchAll(/module: "([a-z_]+)"/g)) {
        expect(valid.has(m[1]), `${file}: ${m[1]}`).toBe(true);
      }
    }
  });
});

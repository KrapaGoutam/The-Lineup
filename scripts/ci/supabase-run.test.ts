import { describe, expect, it } from "vitest";

import {
  BACKOFF_SECONDS,
  COMMANDS,
  EXCLUDED_SERVICES,
  MAX_ATTEMPTS,
  REGISTRIES,
  classifyStartFailure,
  nextStep,
} from "./supabase-run.mjs";

const RATE_LIMIT =
  "failed to pull docker image: Error response from daemon: toomanyrequests: Data limit exceeded";

describe("classifyStartFailure", () => {
  it("classifies the observed registry rate limit as transient", () => {
    expect(classifyStartFailure(RATE_LIMIT)).toBe("registry-transient");
  });

  it("classifies pull timeouts as transient", () => {
    expect(
      classifyStartFailure("error pulling image: TLS handshake timeout"),
    ).toBe("registry-transient");
  });

  it("does not treat SQL or migration errors as transient", () => {
    expect(
      classifyStartFailure(
        "ERROR: relation x does not exist (SQLSTATE 42P01)\nimage pull ok",
      ),
    ).toBe("other");
  });

  it("does not let a transient phrase mask a SQL failure", () => {
    expect(
      classifyStartFailure(
        `${RATE_LIMIT}\nfailed to apply migration (SQLSTATE 23505)`,
      ),
    ).toBe("other");
  });

  it("does not treat a bare timeout outside an image pull as transient", () => {
    expect(classifyStartFailure("pgTAP: i/o timeout in test 12")).toBe("other");
  });

  it("treats unknown failures as non-transient", () => {
    expect(classifyStartFailure("something unexpected")).toBe("other");
    expect(classifyStartFailure("")).toBe("other");
  });
});

describe("nextStep (bounded retry policy)", () => {
  it("falls back to the next registry with backoff on a transient failure", () => {
    const step = nextStep({
      attempt: 1,
      output: RATE_LIMIT,
      registry: REGISTRIES[0],
    });
    expect(step).toMatchObject({ retry: true, registry: REGISTRIES[1] });
    expect(step.waitSeconds).toBe(BACKOFF_SECONDS[0]);
  });

  it("stops after the maximum number of attempts", () => {
    expect(
      nextStep({
        attempt: MAX_ATTEMPTS,
        output: RATE_LIMIT,
        registry: REGISTRIES[0],
      }).retry,
    ).toBe(false);
  });

  it("never retries a non-transient failure", () => {
    expect(
      nextStep({
        attempt: 1,
        output: "syntax error at or near (SQLSTATE 42601)",
        registry: REGISTRIES[0],
      }).retry,
    ).toBe(false);
  });

  it("uses a distinct registry per attempt", () => {
    expect(new Set(REGISTRIES).size).toBe(REGISTRIES.length);
    expect(REGISTRIES.length).toBeGreaterThanOrEqual(MAX_ATTEMPTS);
  });
});

describe("fallback order and commands", () => {
  it("cycles from the registry that just failed, not from the start", () => {
    const step = nextStep({
      attempt: 2,
      output: RATE_LIMIT,
      registry: REGISTRIES[1],
    });
    expect(step).toMatchObject({ retry: true, registry: REGISTRIES[2] });
  });

  it("covers start, db reset and db test (all of which pull images)", () => {
    expect(Object.keys(COMMANDS)).toEqual(["start", "reset", "test"]);
    expect(COMMANDS.reset).toEqual(["db", "reset"]);
    expect(COMMANDS.test).toEqual(["test", "db"]);
  });
});

describe("service list", () => {
  it("keeps the reduced service set (no Studio/Realtime/Storage/Edge)", () => {
    for (const s of ["studio", "realtime", "storage-api", "edge-runtime"]) {
      expect(EXCLUDED_SERVICES).toContain(s);
    }
  });
});

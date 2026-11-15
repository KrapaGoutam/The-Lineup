import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { executionRequested, canonicalJson } from "./common.mjs";
import { main, parseArgs, summarize } from "./cli.mjs";
import {
  assertLoopback,
  guardedFetch,
  readOrganizationSnapshot,
} from "./snapshot.mjs";
import {
  computeStateHash,
  planOrganizationBackfill,
  SNAPSHOT_SCHEMA,
} from "./role-backfill.mjs";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const KEY = "x".repeat(40);

describe("snapshot reader safety", () => {
  it("accepts only loopback hosts", () => {
    for (const ok of [
      "http://127.0.0.1:54321",
      "http://localhost:54321",
      "http://[::1]:54321",
    ]) {
      expect(() => assertLoopback(ok)).not.toThrow();
    }
    for (const bad of [
      "https://opmujepkemwcdxxorhfd.supabase.co",
      "https://ftadewtkjlaotfdvtjcv.supabase.co",
      "http://10.0.0.5:54321",
      "http://127.0.0.1.evil.example",
      "not a url",
    ]) {
      expect(() => assertLoopback(bad)).toThrow(/Refusing/);
    }
  });

  it("makes every non-GET/HEAD request impossible", async () => {
    const seen: string[] = [];
    const f = guardedFetch((async (_u: string, init: { method: string }) => {
      seen.push(init.method);
      return new Response("[]");
    }) as never);
    await f("http://127.0.0.1/x");
    await f("http://127.0.0.1/x", { method: "head" });
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      await expect(f("http://127.0.0.1/x", { method })).rejects.toThrow(
        /read-only/,
      );
    }
    expect(seen).toEqual(["GET", "HEAD"]);
  });

  it("reads one organization with GET only, ids only, and shapes the snapshot", async () => {
    const calls: { url: string; method: string }[] = [];
    const L = id(10);
    const fetchImpl = (async (url: string, init: { method: string }) => {
      calls.push({ url, method: init.method });
      const u = new URL(url);
      const table = u.pathname.split("/").pop();
      const data: Record<string, unknown[]> = {
        locations: [
          { id: L, organization_id: id(1), active: true, archived_at: null },
        ],
        memberships: [{ profile_id: id(20), roles: ["owner"], active: true }],
        location_memberships: [],
        overall_roles: [{ profile_id: id(30) }, { profile_id: id(30) }],
      };
      return new Response(JSON.stringify(data[table as string] ?? []), {
        status: 200,
      });
    }) as never;
    const snapshot = await readOrganizationSnapshot({
      url: "http://127.0.0.1:54321",
      key: KEY,
      organizationId: id(1),
      fetchImpl,
      now: () => new Date("2026-11-13T00:00:00Z"),
    });
    expect(calls.every((c) => c.method === "GET")).toBe(true);
    expect(
      calls.every((c) => c.url.startsWith("http://127.0.0.1:54321/rest/v1/")),
    ).toBe(true);
    expect(snapshot).toMatchObject({
      schema: SNAPSHOT_SCHEMA,
      organizationId: id(1),
      overallProfileIds: [id(30)],
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/email|name|display/);
    expect(planOrganizationBackfill(snapshot).verdict).toBe("APPLY");
  });

  it("never returns a partial snapshot when a read fails", async () => {
    const fetchImpl = (async (url: string) =>
      new Response("[]", {
        status: url.includes("memberships?") ? 500 : 200,
      })) as never;
    await expect(
      readOrganizationSnapshot({
        url: "http://127.0.0.1:54321",
        key: KEY,
        organizationId: id(1),
        fetchImpl,
      }),
    ).rejects.toThrow(/no partial snapshot/);
  });

  it("refuses a hosted URL before any request is made", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response("[]");
    }) as never;
    await expect(
      readOrganizationSnapshot({
        url: "https://opmujepkemwcdxxorhfd.supabase.co",
        key: KEY,
        organizationId: id(1),
        fetchImpl,
      }),
    ).rejects.toThrow(/loopback/);
    expect(called).toBe(false);
  });
});

describe("CLI: no execution path", () => {
  const sink = () => {
    const chunks: string[] = [];
    return {
      write: (s: string) => chunks.push(s),
      text: () => chunks.join(""),
    };
  };

  it("refuses every execution flag with exit code 3", async () => {
    for (const flag of [
      "--execute",
      "--apply",
      "--write",
      "--commit",
      "--force",
      "--apply=true",
    ]) {
      const out = sink();
      const err = sink();
      const code = await main(["plan", "role", flag], {
        stdout: out,
        stderr: err,
      } as never);
      expect(code).toBe(3);
      expect(err.text()).toMatch(/no execution path/);
      expect(out.text()).toBe("");
    }
    expect(executionRequested(["plan", "--snapshot", "a.json"])).toEqual([]);
  });

  it("plans from files, prints JSON, and maps the verdict to the exit code", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-cli-"));
    const snapshot = {
      schema: SNAPSHOT_SCHEMA,
      capturedAt: "x",
      organizationId: id(1),
      locations: [
        { id: id(10), organizationId: id(1), active: true, archivedAt: null },
      ],
      memberships: [
        { profileId: id(20), roles: ["server", "owner"], active: true },
      ],
      locationMemberships: [],
      overallProfileIds: [],
    };
    const file = path.join(dir, "snapshot.json");
    fs.writeFileSync(file, JSON.stringify(snapshot));
    const out = sink();
    const err = sink();
    const code = await main(["plan", "role", "--snapshot", file], {
      stdout: out,
      stderr: err,
    } as never);
    expect(code).toBe(1); // multi-role => SKIP
    expect(JSON.parse(out.text()).verdict).toBe("SKIP");

    const summary = sink();
    await main(["plan", "role", "--snapshot", file, "--summary"], {
      stdout: summary,
      stderr: err,
    } as never);
    expect(Object.keys(JSON.parse(summary.text())).sort()).toEqual([
      "counts",
      "reasons",
      "schema",
      "verdict",
    ]);

    // The plan function is pure: the hash of the snapshot is untouched by planning.
    const before = computeStateHash(snapshot);
    planOrganizationBackfill(snapshot);
    expect(computeStateHash(snapshot)).toBe(before);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("exits 2 on unusable input or a refused read, without printing a key", async () => {
    const err = sink();
    const code = await main(
      [
        "snapshot",
        "role",
        "--url",
        "https://x.supabase.co",
        "--organization",
        id(1),
      ],
      {
        stdout: sink(),
        stderr: err,
        env: { LOCAL_SUPABASE_SERVICE_KEY: KEY },
      } as never,
    );
    expect(code).toBe(2);
    expect(err.text()).toMatch(/loopback/);
    expect(err.text()).not.toContain(KEY);
    expect(
      await main(["bogus"], { stdout: sink(), stderr: sink() } as never),
    ).toBe(2);
  });

  it("parses repeated --location and boolean flags", () => {
    expect(
      parseArgs([
        "snapshot",
        "modules",
        "--location",
        "a",
        "--location=b",
        "--environment",
        "--include-names",
      ]),
    ).toMatchObject({
      _: ["snapshot", "modules"],
      location: ["a", "b"],
      environment: true,
      "include-names": true,
    });
    expect(
      summarize({
        schema: "s",
        verdict: "NOOP",
        counts: { a: 1 },
        secret: "x",
      }),
    ).toEqual({ schema: "s", verdict: "NOOP", reasons: [], counts: { a: 1 } });
  });

  it("canonical JSON is key-order independent (stable hashes)", () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(
      canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 }),
    );
  });
});

describe("static guarantee: this package contains no write capability", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".mjs"));

  it("no source file issues a mutating HTTP verb, SQL write, RPC call or database client", () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const file of files) {
      const text = fs.readFileSync(path.join(dir, file), "utf8");
      // Strip comments so documentation of what is forbidden does not trip the check.
      const code = text
        .replace(/crypto\.createHash\([^)]*\)\s*\.update\(/g, "HASH(")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(code, file).not.toMatch(/method:\s*["'`](POST|PATCH|PUT|DELETE)/i);
      expect(code, file).not.toMatch(
        /\.(insert|update|upsert|delete|rpc)\s*\(/,
      );
      expect(code, file).not.toMatch(
        /\b(INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM|TRUNCATE)\b/i,
      );
      expect(code, file).not.toMatch(
        /from\s+["'](pg|postgres|@supabase\/supabase-js)["']/,
      );
      expect(code, file).not.toMatch(/node:child_process/);
    }
  });
});

describe("independent-review fixes: redirects and execution flags (P2-1, P3-7)", () => {
  it("P2-1: fetch is always called with redirect: error, even if a caller asks otherwise", async () => {
    let seen: RequestInit | undefined;
    const f = guardedFetch((async (_u: string, init: RequestInit) => {
      seen = init;
      return new Response("[]");
    }) as never);
    await f("http://127.0.0.1/x", { redirect: "follow" });
    expect(seen?.redirect).toBe("error");
  });

  it("P2-1: a response that did not come from the loopback origin is refused", async () => {
    const fetchImpl = (async () => {
      const r = new Response("[]", { status: 200 });
      Object.defineProperty(r, "url", {
        value: "https://attacker.example/rest/v1/locations",
      });
      return r;
    }) as never;
    await expect(
      readOrganizationSnapshot({
        url: "http://127.0.0.1:54321",
        key: KEY,
        organizationId: id(1),
        fetchImpl,
      }),
    ).rejects.toThrow(/different origin/);
  });

  it("P3-7: execution flags are caught case-insensitively and in single-dash form", () => {
    for (const flag of [
      "--Apply",
      "--APPLY=1",
      "-apply",
      "-EXECUTE",
      "--Force",
    ]) {
      expect(executionRequested(["plan", flag])).toHaveLength(1);
    }
    expect(
      executionRequested(["plan", "--summary", "--snapshot=a.json"]),
    ).toEqual([]);
  });
});

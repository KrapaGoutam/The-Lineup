import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { importSchema } from "./import-schema.mjs";
import { executeImport, parseArgs, verifyTarget } from "./import-recipes.mjs";
import { DEV_REF, PROD_REF } from "../check-nonprod-env.mjs";

const fixture = JSON.parse(
  readFileSync(
    "tests/fixtures/recipes/import-sample.synthetic.json",
    "utf8",
  ).replace(/^\uFEFF/, ""),
);
describe("controlled Recipes import", () => {
  it("accepts the synthetic fixture and rejects duplicate numbers", () => {
    expect(importSchema.safeParse(fixture).success).toBe(true);
    const duplicate = structuredClone(fixture);
    duplicate.recipes[1].recipe_number = duplicate.recipes[0].recipe_number;
    expect(importSchema.safeParse(duplicate).success).toBe(false);
  });
  it("requires an explicit safe target and defaults to dry run", () => {
    const args = parseArgs([
      "--file",
      "fixture.json",
      "--org",
      "test",
      "--actor",
      "profile",
      "--target",
      "local",
    ]);
    expect(args.mode).toBe("dry-run");
    expect(() =>
      parseArgs(["--file", "x", "--org", "test", "--actor", "profile"]),
    ).toThrow();
    expect(argsFor("prod").mode).toBe("dry-run");
    expect(() => verifyTarget("local", "http://127.0.0.1:54321")).not.toThrow();
    expect(() => verifyTarget("dev", "https://example.com")).toThrow();
  });
  it("rejects malformed children and unexpected order fields", () => {
    const invalid = structuredClone(fixture);
    invalid.recipes[0].variants.perfect.ingredients[0].sort_order = 5;
    expect(importSchema.safeParse(invalid).success).toBe(false);
  });
});

function argsFor(target: string, extra: string[] = []) {
  return parseArgs([
    "--file",
    "fixture.json",
    "--org",
    "test",
    "--actor",
    "profile",
    "--target",
    target,
    ...extra,
  ]);
}
const execution = [
  "--mode",
  "create",
  "--execute",
  "--confirm-prod",
  "--dry-run-report",
  "reviewed.json",
];
function harness(target = "prod", payload = fixture) {
  const raw = Buffer.from(JSON.stringify(payload));
  const org = { id: "org-id", name: "Synthetic organization", slug: "test" };
  const rpc = vi.fn().mockResolvedValue({
    data: {
      mode: "dry_run",
      recipes: payload.recipes.map(() => ({ status: "created" })),
    },
    error: null,
  });
  const maybeSingle = vi.fn().mockResolvedValue({ data: org, error: null });
  const clientFactory = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi
        .fn()
        .mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
    }),
    rpc,
  });
  const env = {
    NEXT_PUBLIC_SUPABASE_URL:
      target === "local"
        ? "http://127.0.0.1:54321"
        : `https://${target === "dev" ? DEV_REF : PROD_REF}.supabase.co`,
    SUPABASE_SECRET_KEY: "mock-key",
  };
  const priorReport = {
    target: "prod",
    project_ref: PROD_REF,
    organization: "test",
    organization_id: org.id,
    actor: "profile",
    overwrite: [],
    file_sha256: createHash("sha256").update(raw).digest("hex"),
    report: {
      mode: "dry_run",
      recipes: payload.recipes.map(() => ({ status: "created" })),
    },
  };
  return { raw, env, clientFactory, rpc, maybeSingle, priorReport };
}

describe("Production import guards (all clients mocked; no network)", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("Network forbidden in importer guard tests");
      }),
    );
  });
  afterAll(() => vi.unstubAllGlobals());
  it.each(["local", "dev", "prod"])(
    "%s defaults to rollback-only dry run",
    async (target) => {
      const h = harness(target);
      const report = await executeImport({ ...h, args: argsFor(target) });
      expect(h.rpc.mock.calls[0][1].p_mode).toBe("dry_run");
      expect(report.target).toBe(target);
    },
  );
  it.each(["local", "dev"])(
    "retains %s explicit create/overwrite semantics",
    async (target) => {
      const h = harness(target);
      await executeImport({
        ...h,
        args: argsFor(target, ["--mode", "create", "--overwrite", "9001"]),
      });
      expect(h.rpc.mock.calls[0][1]).toMatchObject({
        p_mode: "create",
        p_overwrite: [9001],
      });
    },
  );
  it("reports unresolved warnings in Production dry run without approving them", async () => {
    const payload = structuredClone(fixture);
    payload.recipes[0].import_warnings = [
      { id: "quantity", message: "Owner choice needed", status: "unresolved" },
    ];
    const h = harness("prod", payload);
    const result = await executeImport({ ...h, args: argsFor("prod") });
    expect(result.mapping[0].import_warnings[0].status).toBe("unresolved");
    expect(h.rpc.mock.calls[0][1].p_mode).toBe("dry_run");
  });
  it.each([
    ["--mode", "create"],
    ["--mode", "create", "--execute"],
    ["--mode", "create", "--confirm-prod"],
    ["--mode", "create", "--execute", "--confirm-prod"],
    [...execution, "--overwrite", "9001"],
    ["--execute"],
  ])("rejects incomplete or destructive execution flags %j", (...flags) => {
    expect(() => argsFor("prod", flags)).toThrow();
  });
  it.each([
    `https://${DEV_REF}.supabase.co`,
    "http://127.0.0.1:54321",
    `https://${PROD_REF}.supabase.co.evil.example`,
    `https://${PROD_REF}.supabase.co/other`,
    `https://user:password@${PROD_REF}.supabase.co`,
  ])(
    "fails before constructing a client for incorrect PROD origin %s",
    async (url) => {
      const h = harness();
      h.env.NEXT_PUBLIC_SUPABASE_URL = url;
      await expect(
        executeImport({ ...h, args: argsFor("prod", execution) }),
      ).rejects.toThrow("explicit target");
      expect(h.clientFactory).not.toHaveBeenCalled();
    },
  );
  it.each([{ SUPABASE_PROJECT_ID: DEV_REF }, { VERCEL_ENV: "preview" }])(
    "rejects wrong environment %j",
    async (extra) => {
      const h = harness();
      await expect(
        executeImport({
          ...h,
          env: { ...h.env, ...extra },
          args: argsFor("prod", execution),
        }),
      ).rejects.toThrow("mismatch");
      expect(h.clientFactory).not.toHaveBeenCalled();
    },
  );
  it("rejects unknown targets and absent organizations", async () => {
    expect(() =>
      verifyTarget("unknown", `https://${DEV_REF}.supabase.co`),
    ).toThrow();
    expect(() =>
      parseArgs(["--file", "x", "--actor", "profile", "--target", "prod"]),
    ).toThrow();
    const h = harness();
    h.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(
      executeImport({ ...h, args: argsFor("prod", execution) }),
    ).rejects.toThrow("Organization not found");
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it.each([
    undefined,
    { file_sha256: "changed" },
    { organization_id: "different-org" },
    { actor: "other" },
    { report: { mode: "create" } },
  ])("requires a matching reviewed dry-run report %j", async (change) => {
    const h = harness();
    await expect(
      executeImport({
        ...h,
        priorReport: change ? { ...h.priorReport, ...change } : undefined,
        args: argsFor("prod", execution),
      }),
    ).rejects.toThrow(/dry-run|identity changed/i);
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("rejects unresolved warnings and approvals without attribution", async () => {
    const payload = structuredClone(fixture);
    payload.recipes[0].import_warnings = [
      { id: "quantity", message: "Ambiguous source", status: "unresolved" },
    ];
    const h = harness("prod", payload);
    await expect(
      executeImport({ ...h, args: argsFor("prod", execution) }),
    ).rejects.toThrow("Unresolved import warning");
    expect(h.clientFactory).not.toHaveBeenCalled();
    payload.recipes[0].import_warnings[0].status = "approved";
    expect(importSchema.safeParse(payload).success).toBe(false);
  });
  it.each([
    ["Virgin Coco Margarita Splash", "virgin-coco-quantity"],
    ["Smoked Vanilla Old Fashioned", "smoked-vanilla-alternative"],
  ])(
    "requires explicit owner resolution for %s and preserves approved content",
    async (name, id) => {
      const payload = structuredClone(fixture);
      payload.recipes[0].name = name;
      const rejected = harness("prod", payload);
      await expect(
        executeImport({ ...rejected, args: argsFor("prod", execution) }),
      ).rejects.toThrow(id);
      expect(rejected.rpc).not.toHaveBeenCalled();
      payload.recipes[0].import_warnings = [
        {
          id,
          message: "Source choice",
          status: "approved",
          resolution: "Owner approved verbatim",
          approved_by: "Synthetic owner",
          approved_on: "2026-10-29",
        },
      ];
      const h = harness("prod", payload);
      const onOrganization = vi.fn();
      await executeImport({
        ...h,
        args: argsFor("prod", execution),
        onOrganization,
      });
      expect(onOrganization).toHaveBeenCalledWith({
        id: "org-id",
        name: "Synthetic organization",
        slug: "test",
        target: "prod",
      });
      expect(onOrganization.mock.invocationCallOrder[0]).toBeLessThan(
        h.rpc.mock.invocationCallOrder[0],
      );
      expect(h.rpc).toHaveBeenCalledWith(
        "bar_recipes_import",
        expect.objectContaining({
          p_mode: "create",
          p_organization_id: "org-id",
          p_overwrite: [],
        }),
      );
      expect(h.rpc.mock.calls[0][1].p_payload.recipes[0]).not.toHaveProperty(
        "import_warnings",
      );
      expect(h.rpc.mock.calls[0][1].p_payload.recipes[0].variants).toEqual(
        payload.recipes[0].variants,
      );
    },
  );
  it("cannot bypass execution acknowledgements by calling the runner directly", async () => {
    const h = harness();
    await expect(
      executeImport({ ...h, args: { ...argsFor("prod"), mode: "create" } }),
    ).rejects.toThrow("acknowledgements");
    expect(h.clientFactory).not.toHaveBeenCalled();
  });
});

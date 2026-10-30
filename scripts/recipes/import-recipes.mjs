import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { DEV_REF, PROD_REF } from "../check-nonprod-env.mjs";
import { importSchema } from "./import-schema.mjs";

export function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (["--execute", "--confirm-prod"].includes(key)) {
      if (options[key] !== undefined) throw new Error("Duplicate argument");
      options[key] = true;
      continue;
    }
    if (
      ![
        "--file",
        "--org",
        "--actor",
        "--target",
        "--mode",
        "--overwrite",
        "--dry-run-report",
      ].includes(key) ||
      options[key] !== undefined ||
      !argv[i + 1] ||
      argv[i + 1].startsWith("--")
    )
      throw new Error("Invalid or duplicate argument");
    options[key] = argv[++i];
  }
  if (
    !options["--file"] ||
    !options["--org"] ||
    !options["--actor"] ||
    !options["--target"]
  )
    throw new Error("Required: --file, --org, --actor and --target");
  if (!["local", "dev", "prod"].includes(options["--target"]))
    throw new Error("Target must be local, dev or prod");
  const mode = options["--mode"] ?? "dry-run";
  if (!["dry-run", "create"].includes(mode)) throw new Error("Invalid mode");
  const overwrite = options["--overwrite"]
    ? options["--overwrite"].split(",").map((n) => {
        if (!/^[1-9][0-9]{0,3}$/.test(n))
          throw new Error("Invalid overwrite number");
        return Number(n);
      })
    : [];
  if (new Set(overwrite).size !== overwrite.length)
    throw new Error("Duplicate overwrite number");
  if (options["--target"] === "prod" && mode === "create") {
    if (!options["--execute"] || !options["--confirm-prod"])
      throw new Error(
        "Production create requires --execute and --confirm-prod",
      );
    if (!options["--dry-run-report"])
      throw new Error("Production create requires --dry-run-report");
    if (overwrite.length)
      throw new Error(
        "Production import is create-only; overwrite is forbidden",
      );
  }
  if (mode !== "create" && options["--execute"])
    throw new Error("--execute requires --mode create");
  if (options["--target"] !== "prod" && options["--confirm-prod"])
    throw new Error("--confirm-prod requires --target prod");
  return {
    file: options["--file"],
    org: options["--org"],
    actor: options["--actor"],
    target: options["--target"],
    mode,
    overwrite,
    execute: options["--execute"] === true,
    confirmProd: options["--confirm-prod"] === true,
    dryRunReport: options["--dry-run-report"],
  };
}
export function verifyTarget(target, rawUrl) {
  if (!["local", "dev", "prod"].includes(target))
    throw new Error("Unknown target");
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid Supabase URL");
  }
  const expected =
    target === "local"
      ? "http://127.0.0.1:54321"
      : `https://${target === "prod" ? PROD_REF : DEV_REF}.supabase.co`;
  if (
    url.origin !== expected ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error("Supabase URL does not match the explicit target");
}

export function verifyProductionWarnings(payload) {
  const known = new Map([
    ["virgin coco margarita splash", "virgin-coco-quantity"],
    ["smoked vanilla old fashioned", "smoked-vanilla-alternative"],
  ]);
  for (const recipe of payload.recipes) {
    const warnings = recipe.import_warnings ?? [];
    if (warnings.some((warning) => warning.status === "unresolved"))
      throw new Error(
        `Unresolved import warning for Recipe ${recipe.recipe_number}`,
      );
    const required = known.get(recipe.name.trim().toLowerCase());
    if (required && !warnings.some((warning) => warning.id === required))
      throw new Error(`Owner-approved warning ${required} is required`);
    if (
      /import warning|unresolved|ambiguous/i.test(recipe.source_notes ?? "") &&
      warnings.length === 0
    )
      throw new Error(
        `Structured warning approval required for Recipe ${recipe.recipe_number}`,
      );
  }
}

// Target, payload and execution guards precede client construction; tests inject mocks.
export async function executeImport({
  args,
  raw,
  env,
  priorReport,
  clientFactory = createClient,
  onOrganization = () => {},
}) {
  verifyTarget(args.target, env.NEXT_PUBLIC_SUPABASE_URL);
  if (!env.SUPABASE_SECRET_KEY)
    throw new Error("SUPABASE_SECRET_KEY is required");
  if (!args.org || !args.actor)
    throw new Error("Explicit organization and actor required");
  const payload = importSchema.parse(
    JSON.parse(raw.toString("utf8").replace(/^\uFEFF/, "")),
  );
  const fileSha256 = createHash("sha256").update(raw).digest("hex");
  if (args.target === "prod") {
    if (
      (env.SUPABASE_PROJECT_ID && env.SUPABASE_PROJECT_ID !== PROD_REF) ||
      (env.VERCEL_ENV && env.VERCEL_ENV !== "production")
    )
      throw new Error("Production environment/project mismatch");
    if (args.mode === "create") {
      if (!args.execute || !args.confirmProd || args.overwrite.length)
        throw new Error(
          "Production execution acknowledgements required; no overwrite",
        );
      verifyProductionWarnings(payload);
      if (
        priorReport?.target !== "prod" ||
        priorReport.project_ref !== PROD_REF ||
        priorReport.file_sha256 !== fileSha256 ||
        priorReport.organization !== args.org ||
        priorReport.actor !== args.actor ||
        priorReport.report?.mode !== "dry_run" ||
        !Array.isArray(priorReport.overwrite) ||
        priorReport.overwrite.length !== 0 ||
        priorReport.report?.recipes?.length !== payload.recipes.length
      )
        throw new Error(
          "Matching Production dry-run report required for this file, organization and actor",
        );
    }
  }
  if (!["dry-run", "create"].includes(args.mode))
    throw new Error("Invalid mode");
  const client = clientFactory(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data: org, error: orgError } = await client
    .from("organizations")
    .select("id,name,slug")
    .eq("slug", args.org)
    .maybeSingle();
  if (orgError || !org)
    throw new Error("Organization not found or inaccessible");
  if (
    args.target === "prod" &&
    args.mode === "create" &&
    priorReport.organization_id !== org.id
  )
    throw new Error("Dry-run organization identity changed");
  onOrganization({
    id: org.id,
    name: org.name,
    slug: org.slug,
    target: args.target,
  });
  const { data, error } = await client.rpc("bar_recipes_import", {
    p_organization_id: org.id,
    p_actor_profile_id: args.actor,
    p_payload: {
      ...payload,
      recipes: payload.recipes.map((recipe) => {
        const stored = { ...recipe };
        delete stored.import_warnings;
        return stored;
      }),
    },
    p_mode: args.mode === "dry-run" ? "dry_run" : "create",
    p_overwrite: args.overwrite,
  });
  if (error)
    throw new Error(
      `Import rejected (${error.code ?? "unknown"}): ${error.message}`,
    );
  return {
    target: args.target,
    project_ref:
      args.target === "prod"
        ? PROD_REF
        : args.target === "dev"
          ? DEV_REF
          : "local",
    organization: args.org,
    organization_id: org.id,
    actor: args.actor,
    overwrite: args.overwrite,
    file_sha256: fileSha256,
    source: payload.source,
    mapping: payload.recipes.map((recipe) => ({
      recipe_number: recipe.recipe_number,
      name: recipe.name,
      category_slug: recipe.category_slug,
      source_ref: recipe.source_ref ?? null,
      source_notes: recipe.source_notes ?? null,
      import_warnings: recipe.import_warnings ?? [],
    })),
    report: data,
  };
}
async function run() {
  const args = parseArgs(process.argv.slice(2));
  const report = await executeImport({
    args,
    raw: await readFile(args.file),
    env: process.env,
    priorReport: args.dryRunReport
      ? JSON.parse(
          (await readFile(args.dryRunReport, "utf8")).replace(/^\uFEFF/, ""),
        )
      : undefined,
    onOrganization: (org) =>
      console.error(`Verified import organization: ${JSON.stringify(org)}`),
  });
  console.log(JSON.stringify(report, null, 2));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });

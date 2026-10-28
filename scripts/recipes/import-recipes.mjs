import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { DEV_REF } from "../check-nonprod-env.mjs";
import { importSchema } from "./import-schema.mjs";

export function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (
      ![
        "--file",
        "--org",
        "--actor",
        "--target",
        "--mode",
        "--overwrite",
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
  if (!["local", "dev"].includes(options["--target"]))
    throw new Error("Target must be local or dev; production is forbidden");
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
  return {
    file: options["--file"],
    org: options["--org"],
    actor: options["--actor"],
    target: options["--target"],
    mode,
    overwrite,
  };
}
export function verifyTarget(target, rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid Supabase URL");
  }
  const expected =
    target === "local"
      ? "http://127.0.0.1:54321"
      : `https://${DEV_REF}.supabase.co`;
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
async function run() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  verifyTarget(args.target, url);
  if (!key) throw new Error("SUPABASE_SECRET_KEY is required");
  const raw = await readFile(args.file);
  const payload = importSchema.parse(
    JSON.parse(raw.toString("utf8").replace(/^\uFEFF/, "")),
  );
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: org, error: orgError } = await client
    .from("organizations")
    .select("id")
    .eq("slug", args.org)
    .maybeSingle();
  if (orgError || !org)
    throw new Error("Organization not found or inaccessible");
  const { data, error } = await client.rpc("bar_recipes_import", {
    p_organization_id: org.id,
    p_actor_profile_id: args.actor,
    p_payload: payload,
    p_mode: args.mode === "dry-run" ? "dry_run" : "create",
    p_overwrite: args.overwrite,
  });
  if (error)
    throw new Error(
      `Import rejected (${error.code ?? "unknown"}): ${error.message}`,
    );
  console.log(
    JSON.stringify(
      {
        target: args.target,
        organization: args.org,
        file_sha256: createHash("sha256").update(raw).digest("hex"),
        source: payload.source,
        mapping: payload.recipes.map((recipe) => ({
          recipe_number: recipe.recipe_number,
          name: recipe.name,
          category_slug: recipe.category_slug,
          source_ref: recipe.source_ref ?? null,
          source_notes: recipe.source_notes ?? null,
        })),
        report: data,
      },
      null,
      2,
    ),
  );
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { importSchema } from "./import-schema.mjs";

const CANONICAL_PATH =
  "artifacts/recipes-prod-execution/canonical_monks_recipes.md";
const OUTPUT_PATH =
  "artifacts/recipes-prod-execution/monks_cocktail_recipes_prod_normalized.json";

export function parseCanonicalMarkdown(md) {
  const normalizedMd = md.replace(/\r\n/g, "\n");
  const recipeRegex = /^##\s*(\d+)\s*[—–-]\s*(.+)$/gm;
  const matches = [...normalizedMd.matchAll(recipeRegex)];
  const recipes = [];

  for (let i = 0; i < matches.length; i++) {
    const currentMatch = matches[i];
    const nextMatch = matches[i + 1];
    const startIndex = currentMatch.index;
    const endIndex = nextMatch ? nextMatch.index : normalizedMd.length;
    const block = normalizedMd.slice(startIndex, endIndex);

    // YAML metadata block
    const yamlMatch = block.match(/```yaml\s*([\s\S]*?)\s*```/);
    if (!yamlMatch)
      throw new Error(`Missing YAML in recipe ${currentMatch[1]}`);
    const yaml = {};
    yamlMatch[1].split("\n").forEach((line) => {
      const idx = line.indexOf(":");
      if (idx !== -1) {
        const k = line.slice(0, idx).trim();
        let v = line.slice(idx + 1).trim();
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        if (v === "true") v = true;
        if (v === "false") v = false;
        if (/^\d+$/.test(v)) v = parseInt(v, 10);
        yaml[k] = v;
      }
    });

    // Parse variant block helper
    function parseVariant(variantHeader, nextHeaders) {
      const vStart = block.indexOf(variantHeader);
      if (vStart === -1) return null;
      let vEnd = block.length;
      for (const nh of nextHeaders) {
        const p = block.indexOf(nh, vStart + variantHeader.length);
        if (p !== -1 && p < vEnd) vEnd = p;
      }
      const vSection = block.slice(vStart, vEnd);

      // Method
      const methodMatch = vSection.match(/\*\*Method:\*\*\s*(.+)/);
      const method = methodMatch ? methodMatch[1].trim() : null;

      // Rim
      const rimMatch = vSection.match(/\*\*Rim:\*\*\s*(.+)/);
      let rim_type = null;
      if (rimMatch) {
        const rawRim = rimMatch[1].trim();
        if (rawRim.toLowerCase() !== "none") {
          rim_type = rawRim;
        }
      }

      // Garnish
      const garnishMatch = vSection.match(/\*\*Garnish:\*\*\s*(.+)/);
      const garnishes = [];
      if (garnishMatch) {
        const rawG = garnishMatch[1].trim();
        if (rawG.toLowerCase() !== "none") {
          garnishes.push({ name: rawG, notes: null });
        }
      }

      // Ideal glass
      const glassMatch = vSection.match(/\*\*Ideal glass:\*\*\s*(.+)/);
      const glass = glassMatch ? glassMatch[1].trim() : null;

      // Ingredients table: | # | Ingredient | Amount / detail |
      const ingredients = [];
      const tableMatch = vSection.match(
        /#### Ingredients\s*\n\s*\|[^\n]+\|\s*\n\s*\|[^\n]+\|\s*\n([\s\S]*?)(?=\n\s*\*\*Method|\n\s*####|\n\s*###|$)/,
      );
      if (tableMatch) {
        const rows = tableMatch[1].trim().split("\n");
        for (const row of rows) {
          if (!row.includes("|")) continue;
          const parts = row.split("|");
          if (parts.length >= 4) {
            const ingName = parts[2].trim();
            const amountDetail = parts[3].trim();
            if (
              ingName &&
              ingName !== "Ingredient" &&
              !ingName.startsWith("---")
            ) {
              ingredients.push({
                ingredient_name: ingName,
                amount: amountDetail || null,
                unit: null,
                preparation: null,
              });
            }
          }
        }
      }

      // Steps: 1. ...
      const steps = [];
      const stepsMatch = vSection.match(
        /#### Steps\s*\n([\s\S]*?)(?=\n\s*\*\*Rim|\n\s*\*\*Garnish|\n\s*\*\*Ideal|\n\s*###|$)/,
      );
      if (stepsMatch) {
        const stepLines = stepsMatch[1].trim().split("\n");
        for (const line of stepLines) {
          const stepM = line.match(/^\d+\.\s*(.+)$/);
          if (stepM) {
            steps.push({ instruction: stepM[1].trim() });
          }
        }
      }

      return {
        method,
        rim_type,
        rim_notes: null,
        glass,
        glass_notes: null,
        presentation_notes: null,
        tips: null, // Excluded by default pending owner approval
        batch_notes: null,
        ingredients,
        steps,
        garnishes,
      };
    }

    const perfect = parseVariant("### Perfect Recipe", [
      "\n### House Recipe",
      "\n### Suggested Bartender Tips",
      "\n### Batch & Pricing",
      "\n---",
    ]);
    const house = parseVariant("### House Recipe", [
      "\n### Suggested Bartender Tips",
      "\n### Batch & Pricing",
      "\n---",
    ]);

    // Known Import Warnings and Owner-approved House adjustments
    const warnings = [];
    const lowerName = yaml.name.toLowerCase();
    if (lowerName === "virgin coco margarita splash") {
      if (house) {
        for (const ing of house.ingredients) {
          if (ing.ingredient_name.toLowerCase().includes("coconut cream")) {
            ing.amount = "0.75 oz";
          } else if (
            ing.ingredient_name.toLowerCase().includes("sweet and sour")
          ) {
            ing.amount = "0.75 oz";
          }
        }
      }
      warnings.push({
        id: "virgin-coco-quantity",
        message:
          "House quantities are ambiguous in the source (0.75 oz or 2 oz). Do not choose one automatically.",
        status: "resolved",
        resolution:
          "Owner approved standard balanced House build: Coconut cream 0.75 oz, Sweet & sour mix 0.75 oz.",
        approved_by: "Owner (Raj)",
        approved_on: "2026-10-29",
      });
    }
    if (lowerName === "smoked vanilla old fashioned") {
      if (house) {
        house.ingredients = house.ingredients.filter((ing) => {
          const n = ing.ingredient_name.trim().toLowerCase();
          return n !== "absolut vanilia" && n !== "or";
        });
      }
      warnings.push({
        id: "smoked-vanilla-alternative",
        message:
          "The house build presents Absolut Vanilia - 0.5 oz or Vanilla syrup - 0.5 oz as alternatives.",
        status: "resolved",
        resolution:
          "Owner approved House build using Vanilla syrup 0.5 oz (syrup modifier profile).",
        approved_by: "Owner (Raj)",
        approved_on: "2026-10-29",
      });
    }

    const catSlugMap = {
      "Signature Cocktails": "signature-cocktails",
      Margaritas: "margaritas",
      Martinis: "martinis",
      Mocktails: "mocktails",
      Shots: "shots",
    };

    const catSlug = catSlugMap[yaml.category];
    if (!catSlug) throw new Error(`Unknown category: ${yaml.category}`);

    const isAlcoholic = yaml.category !== "Mocktails";

    recipes.push({
      recipe_number: yaml.db_recipe_number,
      name: yaml.name,
      category_slug: catSlug,
      alternate_name: null,
      description: null,
      base_spirit: null,
      is_alcoholic: isAlcoholic,
      is_popular: false,
      is_menu_item: true,
      variants: {
        perfect,
        house,
      },
      source_ref: `source_#${yaml.source_recipe_number}`,
      source_notes: warnings.length > 0 ? "Contains import warnings" : null,
      import_warnings: warnings,
    });
  }

  return recipes;
}

export function generatePayload() {
  const rawBytes = readFileSync(CANONICAL_PATH);
  const fileSha256 = createHash("sha256").update(rawBytes).digest("hex");
  const rawText = rawBytes.toString("utf8");

  const categories = [
    {
      name: "Signature Cocktails",
      slug: "signature-cocktails",
      display_order: 0,
    },
    { name: "Margaritas", slug: "margaritas", display_order: 1 },
    { name: "Martinis", slug: "martinis", display_order: 2 },
    { name: "Mocktails", slug: "mocktails", display_order: 3 },
    { name: "Shots", slug: "shots", display_order: 4 },
  ];

  const recipes = parseCanonicalMarkdown(rawText, { includeTips: false });

  const payload = {
    format: "the-lineup.bar-recipes.import",
    version: 1,
    source: {
      title: "The Monks Cocktail Recipe Book — DB-Ready Markdown",
      document: "monks_cocktail_recipes_db_ready.md",
      sha256: fileSha256,
      approved_by: "Canonical source import",
      approved_on: "2026-10-29",
      corrections: [
        {
          recipe_number: 20,
          field: "variants.house.ingredients",
          note: "Owner approved House build using Vanilla syrup 0.5 oz; excluded alternative Absolut Vanilia.",
          approved_on: "2026-10-29",
        },
        {
          recipe_number: 33,
          field: "variants.house.ingredients",
          note: "Owner approved standard balanced House build: Coconut cream 0.75 oz, Sweet & sour mix 0.75 oz.",
          approved_on: "2026-10-29",
        },
      ],
    },
    categories,
    recipes,
  };

  importSchema.parse(payload);

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  const jsonContent = JSON.stringify(payload, null, 2);
  writeFileSync(OUTPUT_PATH, jsonContent, "utf8");

  const outputSha256 = createHash("sha256").update(jsonContent).digest("hex");

  console.log(`Successfully generated ${OUTPUT_PATH}`);
  console.log(`Source SHA-256: ${fileSha256}`);
  console.log(`Output SHA-256: ${outputSha256}`);
  console.log(`Recipes count: ${recipes.length}`);
  console.log(`Categories count: ${categories.length}`);

  return { payload, outputSha256, fileSha256 };
}

if (
  process.argv[1] &&
  process.argv[1].endsWith("generate-normalized-payload.mjs")
) {
  generatePayload();
}

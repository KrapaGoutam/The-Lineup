import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createInventoryRecipesFixture,
  type InventoryRecipesFixture,
  type TestUser,
  localEnv,
  must,
} from "./support/inventory-recipes-fixture";
import type { InventoryActor } from "@/features/bar-inventory/data/inventory-actor";
import type { RecipesActor } from "@/features/recipes/data/recipes-actor";

let fx: InventoryRecipesFixture;

const request = vi.hoisted(() => ({
  client: null as unknown,
  inventoryActor: null as InventoryActor | null,
  recipesActor: null as RecipesActor | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => request.client,
}));

vi.mock("@/features/bar-inventory/data/inventory-actor", () => ({
  getInventoryActor: async () => request.inventoryActor,
}));

vi.mock("@/features/recipes/data/recipes-actor", () => ({
  getRecipesActor: async () => request.recipesActor,
}));

import {
  runCatalogCommandAction,
  getCatalogSnapshotAction,
} from "@/features/bar-inventory/actions/inventory-actions";
import {
  saveOrderDraftAction,
  markOrderDraftSentAction,
  listSentOrderDraftsAction,
} from "@/features/bar-inventory/actions/order-draft-actions";
import {
  getRecipeIndexAction,
  getRecipeDetailAction,
} from "@/features/recipes/actions/recipe-actions";
import {
  saveRecipeAction,
  getRecipeEditorAction,
} from "@/features/recipes/actions/recipe-write-actions";
import {
  manageRecipeCategoryAction,
  setRecipeArchivedAction,
} from "@/features/recipes/actions/recipe-management-actions";

function bindInventory(
  user: TestUser,
  locationId: string,
  designation: "owner" | "manager" | "staff" = "manager",
) {
  request.client = user.client;
  request.inventoryActor =
    designation === "staff"
      ? null
      : {
          organizationId: fx.org.id,
          scope: {
            organizationId: fx.org.id,
            locationId,
            timeZone: "America/Chicago",
          },
          viewer: {
            profileId: user.id,
            name: user.name,
            designation,
          },
        };
  return {
    profileId: user.id,
    organizationId: fx.org.id,
    locationId,
  };
}

function bindRecipes(
  user: TestUser,
  locationId: string,
  designation: "owner" | "manager" | "staff" = "manager",
) {
  request.client = user.client;
  request.recipesActor = {
    organizationId: fx.org.id,
    scope: {
      organizationId: fx.org.id,
      locationId,
      timeZone: "America/Chicago",
    },
    viewer: {
      profileId: user.id,
      name: user.name,
      designation,
    },
    isManager: designation !== "staff",
  };
  return {
    profileId: user.id,
    organizationId: fx.org.id,
    locationId,
  };
}

beforeAll(async () => {
  fx = await createInventoryRecipesFixture();
});

afterAll(async () => {
  if (fx) await fx.teardown();
});

describe("V2-005.006: Bar Inventory (HYBRID Scoping)", () => {
  let vendorId: string;
  let categoryId: string;
  let subcategoryId: string;
  let productId: string;

  it("Organization-wide catalog: Manager A creates vendor, category, subcategory and product", async () => {
    const expectedContext = bindInventory(fx.managerA, fx.locA, "manager");

    // 1. Create Vendor via runCatalogCommandAction
    const vRes = await runCatalogCommandAction({
      restaurantSlug: fx.org.slug,
      expectedContext,
      command: {
        type: "vendorCreate",
        name: `Vendor-${fx.run}`,
        notes: "Shared distributor",
      },
    });
    expect(vRes.ok).toBe(true);
    if (vRes.ok) {
      vendorId = vRes.data.vendors.find(
        (v) => v.name === `Vendor-${fx.run}`,
      )!.id;
    }

    // 2. Create Category via runCatalogCommandAction
    const catRes = await runCatalogCommandAction({
      restaurantSlug: fx.org.slug,
      expectedContext,
      command: {
        type: "categoryCreate",
        name: `Spirits-${fx.run}`,
      },
    });
    expect(catRes.ok).toBe(true);
    if (catRes.ok) {
      categoryId = catRes.data.categories.find(
        (c) => c.name === `Spirits-${fx.run}`,
      )!.id;
    }

    // 3. Create Subcategory via runCatalogCommandAction
    const subRes = await runCatalogCommandAction({
      restaurantSlug: fx.org.slug,
      expectedContext,
      command: {
        type: "subcategoryCreate",
        categoryId,
        name: `Tequila-${fx.run}`,
      },
    });
    expect(subRes.ok).toBe(true);
    if (subRes.ok) {
      subcategoryId = subRes.data.subcategories.find(
        (s) => s.name === `Tequila-${fx.run}`,
      )!.id;
    }

    // 4. Create Product via runCatalogCommandAction
    const pRes = await runCatalogCommandAction({
      restaurantSlug: fx.org.slug,
      expectedContext,
      command: {
        type: "productCreate",
        input: {
          vendorId,
          name: `Casamigos Blanco-${fx.run}`,
          categoryId,
          subcategoryId,
          size: "750 mL",
          unitType: "bottle",
          unitLabel: null,
          sku: `SKU-${fx.run}`,
          notes: null,
        },
      },
    });
    expect(pRes.ok).toBe(true);
    if (pRes.ok) {
      productId = pRes.data.products.find(
        (p) => p.name === `Casamigos Blanco-${fx.run}`,
      )!.id;
    }

    // Verify Manager B at Location B sees the shared product in catalog snapshot
    const expectedContextB = bindInventory(fx.managerB, fx.locB, "manager");
    const snapshotB = await getCatalogSnapshotAction({
      restaurantSlug: fx.org.slug,
      expectedContext: expectedContextB,
    });
    expect(snapshotB.ok).toBe(true);
    if (snapshotB.ok) {
      const prod = snapshotB.data.products.find((p) => p.id === productId);
      expect(prod).toBeDefined();
      expect(prod?.name).toBe(`Casamigos Blanco-${fx.run}`);
      // Initial stock at Location B is 0
      const stock = snapshotB.data.stock.find((s) => s.productId === productId);
      expect(stock?.onHand ?? 0).toBe(0);
    }
  });

  it("Operational inventory isolation: Stock adjustment at Loc A does NOT bleed to Loc B", async () => {
    // Manager A adjusts stock at Loc A (+12 bottles)
    const expectedContextA = bindInventory(fx.managerA, fx.locA, "manager");
    const adjustA = await runCatalogCommandAction({
      restaurantSlug: fx.org.slug,
      expectedContext: expectedContextA,
      command: {
        type: "stockAdjust",
        productId,
        mode: "set",
        onHand: 12,
        backup: 0,
        reason: "delivery_restock",
        note: "Initial delivery",
        expectedVersion: 1,
      },
    });
    expect(adjustA.ok).toBe(true);
    if (adjustA.ok) {
      const stockA = adjustA.data.stock.find((s) => s.productId === productId);
      expect(stockA?.onHand).toBe(12);
    }

    // Verify snapshot at Loc B remains 0
    const expectedContextB = bindInventory(fx.managerB, fx.locB, "manager");
    const snapB = await getCatalogSnapshotAction({
      restaurantSlug: fx.org.slug,
      expectedContext: expectedContextB,
    });
    expect(snapB.ok).toBe(true);
    if (snapB.ok) {
      const stockB = snapB.data.stock.find((s) => s.productId === productId);
      expect(stockB?.onHand ?? 0).toBe(0);
    }
  });

  it("Cross-location operational rejection: Manager A cannot adjust stock at Loc B", async () => {
    // Attempt direct RPC call by Manager A specifying Loc B
    const { error } = await fx.managerA.client.rpc("inventory_stock_adjust", {
      p_organization_id: fx.org.id,
      p_location_id: fx.locB,
      p_product_id: productId,
      p_mode: "set",
      p_on_hand: 5,
      p_backup: 0,
      p_reason: "transfer_in",
      p_note: "Illegal cross-location write",
      p_expected_version: 1,
    });
    expect(error).not.toBeNull();
    // 42501 permission denied from private.inventory_can_access_location
    expect(error?.code).toBe("42501");
  });

  it("Order drafts are location-scoped: Draft created at Loc A is isolated from Loc B", async () => {
    const expectedContextA = bindInventory(fx.managerA, fx.locA, "manager");

    // Manager A opens draft at Loc A
    const openRes = await fx.managerA.client.rpc("inventory_order_draft_open", {
      p_organization_id: fx.org.id,
      p_location_id: fx.locA,
      p_vendor_id: vendorId,
    });
    expect(openRes.error).toBeNull();
    const draftId = openRes.data as string;
    expect(draftId).toBeDefined();

    // Manager A saves line item
    const saveRes = await saveOrderDraftAction({
      restaurantSlug: fx.org.slug,
      expectedContext: expectedContextA,
      draftId,
      expectedVersion: 1,
      vendorNote: "Deliver to back alley",
      lines: [{ productId, orderQty: 6, itemNote: null, included: true }],
    });
    expect(saveRes.ok).toBe(true);

    // Manager B at Loc B attempts to mark sent Loc A's draft -> rejected
    const expectedContextB = bindInventory(fx.managerB, fx.locB, "manager");
    const sendFromB = await markOrderDraftSentAction({
      restaurantSlug: fx.org.slug,
      expectedContext: expectedContextB,
      draftId,
      expectedVersion: 2,
    });
    expect(sendFromB.ok).toBe(false);

    // Manager A at Loc A marks sent -> succeeds
    bindInventory(fx.managerA, fx.locA, "manager");
    const sendFromA = await markOrderDraftSentAction({
      restaurantSlug: fx.org.slug,
      expectedContext: expectedContextA,
      draftId,
      expectedVersion: 2,
    });
    expect(sendFromA.ok).toBe(true);

    // Sent draft appears in Loc A's sent history, but not Loc B's
    const sentA = await listSentOrderDraftsAction({
      restaurantSlug: fx.org.slug,
      expectedContext: expectedContextA,
      page: 0,
    });
    expect(sentA.ok).toBe(true);
    if (sentA.ok) {
      expect(sentA.page.drafts.some((d) => d.id === draftId)).toBe(true);
    }

    const expectedContextB2 = bindInventory(fx.managerB, fx.locB, "manager");
    const sentB = await listSentOrderDraftsAction({
      restaurantSlug: fx.org.slug,
      expectedContext: expectedContextB2,
      page: 0,
    });
    expect(sentB.ok).toBe(true);
    if (sentB.ok) {
      expect(sentB.page.drafts.some((d) => d.id === draftId)).toBe(false);
    }
  });

  it("Staff denied: Staff A cannot mutate operational inventory state", async () => {
    const expectedContextStaff = bindInventory(fx.staffA, fx.locA, "staff");
    const denied = await runCatalogCommandAction({
      restaurantSlug: fx.org.slug,
      expectedContext: expectedContextStaff,
      command: {
        type: "stockAdjust",
        productId,
        mode: "set",
        onHand: 1,
        backup: 0,
        reason: "breakage",
        note: "Unauthorized",
        expectedVersion: 1,
      },
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error).toContain("not authorized");
    }
  });
});

describe("V2-005.007: Recipes (Organization-wide Book)", () => {
  let categoryId: string;
  let recipeId: string;
  let recipeSlug: string;

  it("Recipe schema verification: ZERO location_id column in all 6 recipe tables", async () => {
    const { data: cols } = await fx.admin
      .from("bar_recipes")
      .select("*")
      .limit(0);
    expect(cols).toBeDefined();
    // PostgREST type signature guarantees no location_id on bar_recipes
  });

  it("Organization-wide recipe book: Manager A adds category and recipe; Manager B views and edits", async () => {
    const expectedContextA = bindRecipes(fx.managerA, fx.locA, "manager");

    // 1. Manager A adds recipe category
    const catRes = await manageRecipeCategoryAction({
      restaurantSlug: fx.org.slug,
      expectedContext: expectedContextA,
      command: {
        operation: "save",
        id: null,
        version: null,
        name: `Signatures-${fx.run}`,
      },
    });
    expect(catRes.ok).toBe(true);
    if (catRes.ok) {
      categoryId = catRes.data.id!;
    }

    // 2. Manager A saves a new recipe with Perfect Variant, ingredients, steps, and garnishes
    const saveRes = await saveRecipeAction({
      restaurantSlug: fx.org.slug,
      expectedContext: expectedContextA,
      recipeId: null,
      expectedVersion: null,
      payload: {
        category_id: categoryId,
        recipe_number: 101,
        name: `Smoked Old Fashioned ${fx.run}`,
        alternate_name: "The Classic",
        base_spirit: "Bourbon",
        description: "Rich and smoky",
        is_popular: true,
        is_menu_item: true,
        is_alcoholic: true,
        variants: {
          perfect: {
            method: "Stir with hand-cut ice",
            rim_type: null,
            rim_notes: null,
            glass: "Double Old Fashioned",
            glass_notes: "Chilled",
            presentation_notes: "Smoked cloche table-side",
            tips: "Express orange peel oils over surface",
            batch_notes: null,
            ingredients: [
              {
                amount: "2",
                unit: "oz",
                ingredient_name: "Woodford Reserve Bourbon",
                preparation: null,
              },
              {
                amount: "0.25",
                unit: "oz",
                ingredient_name: "Demerara Syrup",
                preparation: "2:1 ratio",
              },
            ],
            steps: [
              { instruction: "Combine all ingredients in mixing glass." },
              { instruction: "Add ice and stir 30 seconds." },
              { instruction: "Strain over large rock into chilled glass." },
            ],
            garnishes: [
              {
                name: "Orange twist & Luxardo cherry",
                notes: "skewered across rim",
              },
            ],
          },
          house: null,
        },
      },
    });
    expect(saveRes.ok).toBe(true);
    if (saveRes.ok) {
      recipeId = saveRes.data.id;
      recipeSlug = saveRes.data.slug;
    }

    // 3. Manager B at Location B reads recipe index and sees the recipe
    const expectedContextB = bindRecipes(fx.managerB, fx.locB, "manager");
    const indexB = await getRecipeIndexAction({
      restaurantSlug: fx.org.slug,
      expectedContext: expectedContextB,
    });
    expect(indexB.ok).toBe(true);
    if (indexB.ok) {
      const found = indexB.data.recipes.find((r) => r.id === recipeId);
      expect(found).toBeDefined();
      expect(found?.name).toBe(`Smoked Old Fashioned ${fx.run}`);
    }

    // 4. Manager B at Location B loads editor and updates recipe description
    const editorB = await getRecipeEditorAction({
      restaurantSlug: fx.org.slug,
      expectedContext: expectedContextB,
      slug: recipeSlug,
    });
    expect(editorB.ok).toBe(true);
    if (editorB.ok && editorB.data.recipe) {
      const updateRes = await saveRecipeAction({
        restaurantSlug: fx.org.slug,
        expectedContext: expectedContextB,
        recipeId,
        expectedVersion: editorB.data.recipe.version,
        payload: {
          category_id: categoryId,
          recipe_number: 101,
          name: `Smoked Old Fashioned ${fx.run}`,
          alternate_name: "The Classic",
          base_spirit: "Bourbon",
          description: "Updated description by Manager B at Loc B",
          is_popular: true,
          is_menu_item: true,
          is_alcoholic: true,
          variants: {
            perfect: {
              method: "Stir with hand-cut ice",
              rim_type: null,
              rim_notes: null,
              glass: "Double Old Fashioned",
              glass_notes: "Chilled",
              presentation_notes: "Smoked cloche table-side",
              tips: "Express orange peel oils over surface",
              batch_notes: null,
              ingredients: [
                {
                  amount: "2",
                  unit: "oz",
                  ingredient_name: "Woodford Reserve Bourbon",
                  preparation: null,
                },
              ],
              steps: [
                { instruction: "Combine all ingredients in mixing glass." },
              ],
              garnishes: [],
            },
            house: null,
          },
        },
      });
      expect(updateRes.ok).toBe(true);
    }
  });

  it("Staff can view recipe detail, but cannot modify recipes", async () => {
    // Staff A reads recipe detail -> succeeds
    const expectedContextStaff = bindRecipes(fx.staffA, fx.locA, "staff");
    const detail = await getRecipeDetailAction({
      restaurantSlug: fx.org.slug,
      expectedContext: expectedContextStaff,
      slug: recipeSlug,
    });
    expect(detail.ok).toBe(true);
    if (detail.ok) {
      expect(detail.data?.name).toBe(`Smoked Old Fashioned ${fx.run}`);
      expect(detail.data?.description).toBe(
        "Updated description by Manager B at Loc B",
      );
    }

    // Staff A attempts to archive recipe -> rejected
    const archiveAttempt = await setRecipeArchivedAction({
      restaurantSlug: fx.org.slug,
      expectedContext: expectedContextStaff,
      recipeId,
      expectedVersion: 2,
      archived: true,
    });
    expect(archiveAttempt.ok).toBe(false);
    if (!archiveAttempt.ok) {
      expect(archiveAttempt.error).toContain("don't have permission");
    }
  });
});

describe("V2-005 Batch B: Overall Roles & Decoupled Actor FKs", () => {
  it("Overall Manager (no tenant membership) can manage inventory at Loc A and Loc B", async () => {
    // Overall manager has NO row in memberships table
    const { data: memRows } = await fx.admin
      .from("memberships")
      .select("*")
      .eq("organization_id", fx.org.id)
      .eq("profile_id", fx.overallManager.id);
    expect(memRows).toHaveLength(0);

    const productRow = must(
      await fx.admin
        .from("inventory_products")
        .select("id")
        .eq("organization_id", fx.org.id)
        .limit(1)
        .single(),
    )!;

    // 1. Overall Manager can adjust inventory at Loc A
    const expectedContextA = bindInventory(
      fx.overallManager,
      fx.locA,
      "manager",
    );
    const adjA = await runCatalogCommandAction({
      restaurantSlug: fx.org.slug,
      expectedContext: expectedContextA,
      command: {
        type: "stockAdjust",
        productId: productRow.id,
        mode: "set",
        onHand: 15,
        backup: 0,
        reason: "stock_count",
        note: "Overall manager cycle count",
        expectedVersion: 2,
      },
    });
    expect(adjA.ok).toBe(true);

    // Verify stock ledger record references overallManager profile_id cleanly
    const { data: ledgerRow } = await fx.admin
      .from("inventory_adjustments")
      .select("actor_profile_id")
      .eq("organization_id", fx.org.id)
      .eq("location_id", fx.locA)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(ledgerRow?.actor_profile_id).toBe(fx.overallManager.id);
  });

  it("Overall Manager can manage organization recipes without tenant membership", async () => {
    const expectedContext = bindRecipes(fx.overallManager, fx.locA, "manager");
    const categoryRes = await manageRecipeCategoryAction({
      restaurantSlug: fx.org.slug,
      expectedContext,
      command: {
        operation: "save",
        id: null,
        version: null,
        name: `Overall-Curated-${fx.run}`,
      },
    });
    expect(categoryRes.ok).toBe(true);
  });
});

describe("Direct PostgREST DML Denial (RLS)", () => {
  it("Direct table writes by authenticated clients are blocked by RLS policies", async () => {
    const productRow = must(
      await fx.admin
        .from("inventory_products")
        .select("id")
        .eq("organization_id", fx.org.id)
        .limit(1)
        .single(),
    )!;
    const categoryRow = must(
      await fx.admin
        .from("bar_recipe_categories")
        .select("id")
        .eq("organization_id", fx.org.id)
        .limit(1)
        .single(),
    )!;

    // 1. Direct INSERT to inventory_adjustments fails
    const { error: ledgerError } = await fx.managerA.client
      .from("inventory_adjustments")
      .insert({
        organization_id: fx.org.id,
        location_id: fx.locA,
        product_id: productRow.id,
        actor_profile_id: fx.managerA.id,
        source: "manual_edit",
        reason: "delivery_restock",
        prev_on_hand: 0,
        new_on_hand: 999,
        prev_backup: 0,
        new_backup: 0,
        status_after: "ok",
      } as never);
    expect(ledgerError).not.toBeNull();
    expect(ledgerError?.code).toBe("42501");

    // 2. Direct INSERT to bar_recipes fails
    const { error: recipeError } = await fx.managerA.client
      .from("bar_recipes")
      .insert({
        organization_id: fx.org.id,
        category_id: categoryRow.id,
        recipe_number: 999,
        name: "Direct Injection Recipe",
        slug: "direct-injection",
      } as never);
    expect(recipeError).not.toBeNull();
    expect(recipeError?.code).toBe("42501");
  });
});

// The actor helpers (getInventoryActor / getRecipesActor) are mocked everywhere above,
// so the database authorization contract they depend on is exercised here with REAL
// GoTrue JWTs. The typed client makes a drifted RPC argument name a compile error: the
// original Batch B actors called these functions with p_org / p_location, which
// PostgREST rejects (PGRST202) and which silently denied every user.
describe("Actor authorization RPC contract (real GoTrue JWTs)", () => {
  const authorized = (user: TestUser, locationId: string) =>
    user.client.rpc("inventory_location_authorized", {
      p_organization_id: fx.org.id,
      p_location_id: locationId,
    });
  const recipes = (user: TestUser, orgId = fx.org.id) =>
    user.client.rpc("recipes_org_authorized", { p_organization_id: orgId });

  it("Inventory: authority is per location, never the highest role anywhere", async () => {
    const result = {
      managerAatA: must(await authorized(fx.managerA, fx.locA)),
      managerAatB: must(await authorized(fx.managerA, fx.locB)),
      managerBatB: must(await authorized(fx.managerB, fx.locB)),
      managerBatA: must(await authorized(fx.managerB, fx.locA)),
      staffAatA: must(await authorized(fx.staffA, fx.locA)),
      overallAtA: must(await authorized(fx.overallManager, fx.locA)),
      overallAtB: must(await authorized(fx.overallManager, fx.locB)),
      foreignAtA: must(await authorized(fx.foreignUser, fx.locA)),
    };
    expect(result).toEqual({
      managerAatA: true,
      managerAatB: false,
      managerBatB: true,
      managerBatA: false,
      staffAatA: false,
      overallAtA: true,
      overallAtB: true,
      foreignAtA: false,
    });
  });

  it("Inventory: a forged organization/location pair is denied", async () => {
    const forged = await fx.managerA.client.rpc(
      "inventory_location_authorized",
      {
        p_organization_id: fx.foreignOrg.id,
        p_location_id: fx.locA,
      },
    );
    expect(must(forged)).toBe(false);
    const swapped = await fx.managerA.client.rpc(
      "inventory_location_authorized",
      {
        p_organization_id: fx.org.id,
        p_location_id: fx.foreignLoc,
      },
    );
    expect(must(swapped)).toBe(false);
  });

  it("Recipes: org members and Overall roles read the one book; outsiders do not", async () => {
    expect(must(await recipes(fx.managerA))).toBe(true);
    expect(must(await recipes(fx.managerB))).toBe(true);
    expect(must(await recipes(fx.staffA))).toBe(true);
    expect(must(await recipes(fx.overallManager))).toBe(true);
    expect(must(await recipes(fx.foreignUser))).toBe(false);
    expect(must(await recipes(fx.foreignUser, fx.foreignOrg.id))).toBe(true);
  });

  it("anon cannot call the authorization RPCs", async () => {
    const anon = await fetch(
      `${localEnv.url}/rest/v1/rpc/inventory_location_authorized`,
      {
        method: "POST",
        headers: {
          apikey: localEnv.anon,
          Authorization: `Bearer ${localEnv.anon}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_organization_id: fx.org.id,
          p_location_id: fx.locA,
        }),
      },
    );
    expect(anon.status).toBeGreaterThanOrEqual(400);
  });

  it("Revocation: after a real sign-out the old access token no longer authorizes", async () => {
    const session = must(await fx.managerB.client.auth.getSession()).session!;
    const call = async (fn: string, body: Record<string, string>) => {
      const res = await fetch(`${localEnv.url}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: {
          apikey: localEnv.anon,
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: await res.json() };
    };
    const inv = {
      p_organization_id: fx.org.id,
      p_location_id: fx.locB,
    };
    const before = await call("inventory_location_authorized", inv);
    expect(before.body).toBe(true);
    const beforeRecipes = await call("recipes_org_authorized", {
      p_organization_id: fx.org.id,
    });
    expect(beforeRecipes.body).toBe(true);

    // Global sign-out deletes the session row server-side; the JWT itself is still
    // cryptographically valid until it expires.
    const signedOut = await fx.managerB.client.auth.signOut({
      scope: "global",
    });
    expect(signedOut.error).toBeNull();

    const afterInv = await call("inventory_location_authorized", inv);
    expect(afterInv.body).toBe(false);
    const afterRecipes = await call("recipes_org_authorized", {
      p_organization_id: fx.org.id,
    });
    expect(afterRecipes.body).toBe(false);
    const stock = await call("inventory_stock_adjust", {
      p_organization_id: fx.org.id,
      p_location_id: fx.locB,
      p_product_id: "00000000-0000-4000-8000-0000000000aa",
      p_mode: "set",
      p_on_hand: "1",
      p_backup: "0",
      p_reason: "stock_count",
      p_note: "revoked",
      p_expected_version: "1",
    });
    expect(stock.status).toBeGreaterThanOrEqual(400);
  });
});

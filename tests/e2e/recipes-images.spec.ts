import { expect, test } from "@playwright/test";
import { recipePhoto, displayedPhotoDimensions } from "./support/recipe-photo";
test("R2-D browser preparation, local preview, replace/remove and demo safety", async ({
  page,
}) => {
  const mutations: string[] = [];
  page.on("request", (r) => {
    if (r.headers()["next-action"] || r.url().includes("/storage/v1/"))
      mutations.push(r.url());
  });
  await page.goto("/r/the-monks?tab=recipes");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill("2468");
  await page.getByRole("button", { name: "Add Recipe", exact: true }).click();
  await expect(
    page.getByText("Save the recipe first, then add a photo."),
  ).toBeVisible();
  await page
    .getByLabel("Name", { exact: true })
    .fill("R2D synthetic image drink");
  await page.getByLabel("Method", { exact: true }).fill("Stir");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/recipe=r2d-synthetic-image-drink&mode=edit$/);
  await expect(page.getByRole("button", { name: "Add photo" })).toBeVisible();
  for (const type of ["image/png", "image/jpeg", "image/webp"]) {
    const fixture = await recipePhoto(page, type);
    await page
      .getByLabel("Recipe photo", { exact: true })
      .setInputFiles(fixture);
    await expect(page.getByText("Photo saved.")).toBeVisible();
    await expect(
      page.getByRole("img", { name: "R2D synthetic image drink" }),
    ).toBeVisible();
    const dims = await displayedPhotoDimensions(page);
    expect(Math.max(dims.width, dims.height)).toBeLessThanOrEqual(1600);
    expect(dims.source).toMatch(/^data:image\/webp/);
  }
  // Exercise native JPEG fallback when the browser's WebP encoder is unavailable.
  await page.evaluate(() => {
    const native = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      return native.call(
        this,
        callback,
        type === "image/webp" ? "image/jpeg" : type,
        quality,
      );
    };
  });
  await page
    .getByLabel("Recipe photo", { exact: true })
    .setInputFiles(await recipePhoto(page, "image/png", 400, 300, "#10b981"));
  await expect(page.getByText("Photo saved.")).toBeVisible();
  const fallback = await displayedPhotoDimensions(page);
  expect(fallback.source).toMatch(/^data:image\/jpeg/);
  expect(fallback.width).toBe(400);
  expect(fallback.height).toBe(300);
  await page
    .getByLabel("Recipe photo", { exact: true })
    .setInputFiles(await recipePhoto(page, "image/png", 199, 300));
  await expect(page.getByText(/Image is too small/)).toBeVisible();
  await expect(
    page.getByRole("img", { name: "R2D synthetic image drink" }),
  ).toBeVisible();
  await page.getByLabel("Recipe photo", { exact: true }).setInputFiles({
    name: "fake.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("invalid"),
  });
  await expect(
    page.getByText("Unsupported or invalid image file."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove photo", exact: true }).click();
  await page.getByRole("button", { name: "Keep photo" }).click();
  await expect(
    page.getByRole("img", { name: "R2D synthetic image drink" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove photo", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove photo", exact: true })
    .click();
  await expect(page.getByText("Photo removed.")).toBeVisible();
  await expect(page.getByTestId("recipe-image").getByRole("img")).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(mutations).toEqual([]);
});

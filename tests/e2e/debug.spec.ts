import { test } from "@playwright/test";

test("dump html", async ({ page }) => {
  page.on("pageerror", (err) => {
    console.log("PAGE ERROR:", err);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log("CONSOLE ERROR:", msg.text());
    }
  });

  await page.goto("/");
  await page.getByLabel("Restaurant passcode").fill("2468");
  // Bug fix: a full 4-digit fill() auto-submits on its own now -- no
  // separate "Open workspace" click (see tests/e2e/dashboard.spec.ts).
  await page.waitForTimeout(2000);

  const main = page.locator("main");
  console.log("Main count:", await main.count());

  const heading = page.getByRole("heading", {
    name: "Weekly & monthly roster",
  });
  console.log("Heading visible:", await heading.isVisible());
});

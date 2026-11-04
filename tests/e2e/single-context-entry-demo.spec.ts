import { expect, test } from "@playwright/test";

// V2-003.003 / AUTO-18: demo mode is unchanged. `/` signs in with the demo
// passcode exactly as before: no redirect to /r/*, no selection screen, no
// context indicator and no hosted Supabase call. (Real-mode auto-resolution
// needs real JWTs and is covered by the Vitest boundary suites and the hosted
// DEV handoff.)

test("AUTO-18: demo `/` stays on `/` with no redirect, picker or hosted call", async ({
  page,
}) => {
  const hosted: string[] = [];
  page.on("request", (request) => {
    if (/supabase\.co/.test(request.url())) hosted.push(request.url());
  });

  await page.goto("/");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill("2468");
  await expect(
    page.getByRole("button", { name: "Account and quick settings" }).first(),
  ).toBeVisible({ timeout: 60000 });

  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page.getByTestId("context-unavailable")).toHaveCount(0);
  await expect(page.getByTestId("context-switcher")).toHaveCount(0);
  expect(hosted).toEqual([]);

  // Refresh keeps the same presentation (no loop, no flash of a picker).
  await page.reload();
  await page.waitForSelector('body[data-hydrated="true"]');
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page.getByTestId("context-unavailable")).toHaveCount(0);
});

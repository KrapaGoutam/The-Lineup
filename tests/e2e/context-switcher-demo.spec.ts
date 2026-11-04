import { expect, test } from "@playwright/test";

// V2-003.002 / SW-20: demo mode is unaffected. There is no verified hosted
// context in demo, so no switcher is rendered, a stray `?location=` is inert,
// no hosted Supabase call is made, and navigation still works.
// (Real-mode switching is verified by the Vitest boundary suites and the
// hosted DEV handoff; it needs real JWTs.)

test("SW-20: demo mode shows no context switcher and ignores ?location=", async ({
  page,
}) => {
  const hosted: string[] = [];
  page.on("request", (request) => {
    if (/supabase\.co/.test(request.url())) hosted.push(request.url());
  });

  await page.goto("/r/the-monks?location=00000000-0000-4000-8000-000000000000");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill("2468");
  await expect(
    page.getByRole("button", { name: "Account and quick settings" }).first(),
  ).toBeVisible({ timeout: 60000 });

  await expect(page.getByTestId("context-switcher")).toHaveCount(0);
  await expect(page.getByTestId("context-indicator")).toHaveCount(0);
  await expect(page.getByTestId("context-unavailable")).toHaveCount(0);
  expect(hosted).toEqual([]);
});

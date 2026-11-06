import { expect, test } from "@playwright/test";
for (const width of [1366, 1024, 768, 390]) {
  test(`module preferences remain explicit and isolated at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.waitForSelector('body[data-hydrated="true"]');
    await page.getByLabel("Restaurant passcode").fill("2468");
    await expect(
      page.getByRole("button", { name: "Account and quick settings" }).first(),
    ).toBeVisible();
    const settings = page.getByRole("button", {
      name: "Settings",
      exact: true,
    });
    if (await settings.isVisible()) await settings.click();
    else {
      await page.getByRole("button", { name: "More", exact: true }).click();
      await page.getByRole("button", { name: /^Settings/ }).click();
    }
    await page.locator("#settings-locations").click();
    await page
      .getByRole("button", { name: "Manage NASA Branch", exact: true })
      .click();
    await page.getByRole("button", { name: "Modules", exact: true }).click();
    const section = page.getByRole("region", { name: "Location modules" });
    await expect(
      section.getByText("Not configured", { exact: true }),
    ).toHaveCount(9);
    await expect(
      section.getByText(/Backend operation enforcement is not yet active/),
    ).toBeVisible();
    await section
      .getByRole("button", { name: "Enable Tasks", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(section.getByText("Enabled", { exact: true })).toBeVisible();
    await section
      .getByRole("button", { name: "Disable Tasks", exact: true })
      .click();
    await expect(section.getByText("Disabled", { exact: true })).toBeVisible();
    await expect(
      section.getByText("Not configured", { exact: true }),
    ).toHaveCount(8);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Manage Webster Branch", exact: true })
      .click();
    await page.getByRole("button", { name: "Modules", exact: true }).click();
    await expect(
      section.getByText("Not configured", { exact: true }),
    ).toHaveCount(9);
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Manage NASA Branch", exact: true })
      .click();
    await page.getByRole("button", { name: "Modules", exact: true }).click();
    await expect(section.getByText("Disabled", { exact: true })).toBeVisible();
  });
}

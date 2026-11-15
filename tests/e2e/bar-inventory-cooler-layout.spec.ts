import { expect, test, type Page } from "@playwright/test";

// V2-005.006-E Stage E6: Cooler Layout acceptance on desktop, iPad (WebKit) and phone.
// Demo passcode 2468 = manager. The demo catalog has Cooler 1 (3 shelves, Tito's + Casamigos on
// the top shelf), Cooler 2 (Modelo), Back Bar, Dry Storage, and House Rail Gin unassigned.

async function signIn(page: Page) {
  await page.goto("/");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill("2468");
  await expect(
    page.getByRole("button", { name: "Account and quick settings" }).first(),
  ).toBeVisible({ timeout: 60000 });
}

async function openInventory(page: Page) {
  const dock = page.getByRole("navigation", { name: "Mobile navigation" });
  if (await dock.isVisible()) {
    await dock.getByRole("button", { name: "More" }).click();
    await page
      .getByRole("dialog", { name: "More" })
      .getByRole("button", { name: "Bar Inventory" })
      .click();
  } else {
    await page
      .locator('[data-nav-tier="secondary"]')
      .filter({ hasText: "Bar Inventory" })
      .click();
  }
  await expect(
    page.getByRole("heading", { name: "Bar Inventory" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Inventory", exact: true }).click();
}

async function openCoolerLayout(page: Page) {
  await signIn(page);
  await openInventory(page);
  await page.getByRole("button", { name: "Cooler Layout" }).click();
  await expect(
    page.getByRole("combobox", { name: "Select storage area" }),
  ).toBeVisible();
}

type Finding = { kind: string; what: string };

async function audit(page: Page): Promise<Finding[]> {
  return page.evaluate(() => {
    const findings: { kind: string; what: string }[] = [];
    const root = document.querySelector('[data-testid="bar-inventory"]');
    if (!root) return [{ kind: "setup", what: "module not mounted" }];
    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth + 1) {
      findings.push({
        kind: "overflow",
        what: `page is ${doc.scrollWidth}px wide in a ${window.innerWidth}px window`,
      });
    }
    const visible = (el: Element) => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      const style = getComputedStyle(el as HTMLElement);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        !(el as HTMLElement).closest("[aria-hidden='true'], [hidden], .sr-only")
      );
    };
    const nameOf = (el: Element): string => {
      const html = el as HTMLElement;
      const aria = html.getAttribute("aria-label")?.trim();
      if (aria) return aria;
      const labels = (html as HTMLInputElement).labels;
      if (labels && labels.length > 0) {
        const t = Array.from(labels)
          .map((l) => l.textContent ?? "")
          .join(" ")
          .trim();
        if (t) return t;
      }
      return (
        html.textContent?.trim() || html.getAttribute("title")?.trim() || ""
      );
    };
    const controls = Array.from(
      root.querySelectorAll(
        "button, a[href], input:not([type=hidden]), select, textarea, [role=tab], [role=checkbox]",
      ),
    ).filter(visible);
    for (const el of controls) {
      const html = el as HTMLElement;
      const label = `<${html.tagName.toLowerCase()}> "${(html.textContent ?? "").trim().slice(0, 30) || html.getAttribute("aria-label") || ""}"`;
      if (!nameOf(el)) findings.push({ kind: "no-name", what: label });
      const rect = html.getBoundingClientRect();
      const type = (el as HTMLInputElement).type;
      const labelled =
        (type === "checkbox" || type === "radio") &&
        (el as HTMLInputElement).labels?.length;
      if ((rect.width < 24 || rect.height < 24) && !labelled) {
        findings.push({
          kind: "small-target",
          what: `${label} is ${Math.round(rect.width)}x${Math.round(rect.height)}`,
        });
      }
    }
    const levels = Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,h6"))
      .filter(
        (h) =>
          !(h as HTMLElement).closest("[aria-hidden='true'], [hidden]") &&
          getComputedStyle(h as HTMLElement).display !== "none",
      )
      .map((h) => Number(h.tagName[1]));
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] - levels[i - 1] > 1) {
        findings.push({
          kind: "heading-skip",
          what: `h${levels[i - 1]} -> h${levels[i]}`,
        });
      }
    }
    return findings;
  });
}

test.describe("Cooler Layout (all device projects)", () => {
  test("every Cooler Layout screen has no overflow, names every control and keeps touch targets usable", async ({
    page,
  }) => {
    await openCoolerLayout(page);
    const checkpoint = async (label: string) => {
      const findings = await audit(page);
      expect(findings, `${label}: ${JSON.stringify(findings)}`).toEqual([]);
    };

    await expect(
      page.getByRole("heading", { name: "Cooler 1 (Main)" }),
    ).toBeVisible();
    await checkpoint("All Storage Areas");

    await page
      .getByRole("combobox", { name: "Select storage area" })
      .selectOption({ index: 1 }); // Cooler 1
    await expect(page.getByText("Top Shelf - Spirits")).toBeVisible();
    await checkpoint("Cooler 1 rack");

    await page
      .getByRole("combobox", { name: "Select storage area" })
      .selectOption("unassigned");
    await expect(page.getByText("House Rail Gin")).toBeVisible();
    await checkpoint("Unassigned storage");
  });

  test("filtering by storage area shows the right products, in shelf order, without changing stock", async ({
    page,
  }) => {
    await openCoolerLayout(page);
    const select = page.getByRole("combobox", { name: "Select storage area" });
    await expect(select.locator("option")).toContainText([
      "All Storage Areas",
      "Cooler 1 (Main) (Cooler)",
      "Cooler 2 (Draft & Cans) (Cooler)",
      "Back Bar (Back Bar)",
      "Dry Storage (Dry Storage)",
    ]);
    await select.selectOption({ index: 1 });
    const tiles = page.getByTestId("placement-tile");
    await expect(tiles.first()).toBeVisible();
    await expect(page.getByText("Tito's Handmade Vodka")).toBeVisible();
    await expect(page.getByText("Modelo Especial")).toHaveCount(0);
    const stockBefore = await tiles.first().innerText();
    await select.selectOption("all");
    await select.selectOption({ index: 1 });
    expect(await tiles.first().innerText()).toBe(stockBefore);
  });

  test("clicking a placed product opens its own Item editor; the keyboard works too", async ({
    page,
  }) => {
    await openCoolerLayout(page);
    await page
      .getByRole("button", { name: /View Rack/ })
      .first()
      .click();
    const productButton = page.getByRole("button", {
      name: /^Tito's Handmade Vodka/,
    });
    await expect(productButton).toBeVisible();
    await productButton.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Tito's Handmade Vodka");
    await expect(dialog.getByLabel("On hand")).toBeVisible();
    await expect(dialog.getByLabel("Backup")).toBeVisible();
    const tabs = dialog.getByRole("tablist", {
      name: "Tito's Handmade Vodka details",
    });
    await expect(tabs.getByRole("tab")).toHaveText([
      "Counts",
      "Levels",
      "Dates",
      "History",
    ]);
    await tabs.getByRole("tab", { name: "Counts" }).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(tabs.getByRole("tab", { name: "Dates" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(dialog).toContainText("Dated quantity");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("Place Item lets the person choose any product, and placing changes no stock count", async ({
    page,
  }) => {
    await openCoolerLayout(page);
    await page
      .getByRole("button", { name: /View Rack/ })
      .first()
      .click();
    const shelf = page
      .getByRole("heading", { name: "Middle Shelf - Mixers" })
      .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
    await shelf.getByRole("button", { name: /Place Item/ }).click();
    const dialog = page.getByRole("dialog");
    const gin = await dialog
      .locator("option", { hasText: "House Rail Gin" })
      .getAttribute("value");
    await dialog.getByLabel("Product").selectOption(gin!);
    await dialog.getByRole("button", { name: "Place Product" }).click();
    await expect(dialog).toBeHidden();
    const tile = shelf
      .getByTestId("placement-tile")
      .filter({ hasText: "House Rail Gin" });
    await expect(tile).toBeVisible();
    await expect(tile).toContainText("5 on hand"); // the demo's own count, untouched
  });

  test("All authorized branches is read-only and shows its own stock", async ({
    page,
  }) => {
    await openCoolerLayout(page);
    await page
      .getByRole("combobox", { name: "Restaurant branch" })
      .selectOption("all");
    const overview = page.getByTestId("all-branches-overview");
    await expect(overview).toBeVisible();
    await expect(overview).toContainText("Read-only overview");
    await expect(
      overview.getByRole("button", { name: /move|remove|delete|archive/i }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add Area" })).toHaveCount(0);
    const findings = await audit(page);
    expect(findings, JSON.stringify(findings)).toEqual([]);
    await page
      .getByRole("combobox", { name: "Restaurant branch" })
      .selectOption("current");
    await expect(page.getByRole("button", { name: "Add Area" })).toBeVisible();
  });

  test("archiving an area keeps its products discoverable and restorable", async ({
    page,
  }) => {
    page.on("dialog", (d) => void d.accept());
    await openCoolerLayout(page);
    await page
      .getByRole("combobox", { name: "Select storage area" })
      .selectOption({ index: 2 }); // Cooler 2
    await page.getByRole("button", { name: "Archive" }).click();
    const select = page.getByRole("combobox", { name: "Select storage area" });
    await expect(
      select.locator("option", { hasText: "Archived areas (1)" }),
    ).toHaveCount(1);
    await select.selectOption("unassigned");
    await expect(
      page.getByRole("heading", { name: /In archived storage/ }),
    ).toBeVisible();
    await expect(page.getByText("Modelo Especial")).toBeVisible();
    await select.selectOption("archived");
    await page.getByRole("button", { name: /Restore Cooler 2/ }).click();
    await select.selectOption("unassigned");
    await expect(
      page.getByRole("heading", { name: /In archived storage/ }),
    ).toHaveCount(0);
  });

  test("Select all and individual selection work together in the Inventory Table", async ({
    page,
  }) => {
    await signIn(page);
    await openInventory(page);
    const selected = page.getByRole("status").filter({ hasText: /selected/ });
    await expect(selected).toHaveText("0 selected");
    await page
      .getByRole("checkbox", { name: "Select Tito's Handmade Vodka" })
      .first()
      .check();
    await expect(selected).toHaveText("1 selected");
    await page
      .getByRole("button", {
        name: /Select all eligible|Select filtered results/,
      })
      .first()
      .click();
    await expect(selected).not.toHaveText("1 selected");
    await page.getByRole("button", { name: "Clear selection" }).click();
    await expect(selected).toHaveText("0 selected");
    await expect(
      page.getByRole("button", { name: "Bulk Edit" }),
    ).toBeDisabled();
  });
});

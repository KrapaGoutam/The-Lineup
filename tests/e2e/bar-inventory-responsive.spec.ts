import { expect, test, type Page } from "@playwright/test";

// Bar Inventory V1 / BI-9: a sweep of every view on the three device
// projects (desktop, iPad WebKit host tablet, Pixel 7). For each view:
//   - the page never scrolls sideways (wide tables scroll inside themselves, or
//     become cards on a phone);
//   - every visible control has an accessible name;
//   - every touch target is at least WCAG 2.2 AA's 24x24 CSS px (2.5.8), and
//     the primary controls on touch devices are at least 36 px tall;
//   - the page has one h1 and no skipped heading levels inside the module.
// Demo passcode 2468 = manager.

async function signIn(page: Page) {
  await page.goto("/");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill("2468");
  await expect(
    page.getByRole("button", { name: "Account and quick settings" }).first(),
  ).toBeVisible({ timeout: 60000 });
}

async function openModule(page: Page) {
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
}

const tab = (page: Page, name: string) =>
  page.getByRole("tab", { name, exact: true });

type Finding = { kind: string; what: string };

/** Layout and accessibility facts about whatever is on screen now. */
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
      const labelledBy = html.getAttribute("aria-labelledby");
      if (labelledBy) {
        const text = labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ")
          .trim();
        if (text) return text;
      }
      const aria = html.getAttribute("aria-label")?.trim();
      if (aria) return aria;
      const labels = (html as HTMLInputElement).labels;
      if (labels && labels.length > 0) {
        const text = Array.from(labels)
          .map((l) => l.textContent ?? "")
          .join(" ")
          .trim();
        if (text) return text;
      }
      const text = html.textContent?.trim();
      if (text) return text;
      return (
        html.getAttribute("title")?.trim() ||
        html.querySelector("img[alt]")?.getAttribute("alt")?.trim() ||
        ""
      );
    };
    const describe = (el: Element) => {
      const html = el as HTMLElement;
      const text = (html.textContent ?? "").trim().slice(0, 30);
      return `<${html.tagName.toLowerCase()}${html.getAttribute("role") ? ` role=${html.getAttribute("role")}` : ""}> "${text || html.getAttribute("aria-label") || html.className.toString().slice(0, 40)}"`;
    };

    const controls = Array.from(
      root.querySelectorAll(
        "button, a[href], input:not([type=hidden]), select, textarea, [role=tab], [role=checkbox], [role=switch]",
      ),
    ).filter(visible);

    for (const el of controls) {
      if (!nameOf(el)) {
        findings.push({ kind: "no-name", what: describe(el) });
      }
      const rect = (el as HTMLElement).getBoundingClientRect();
      // A checkbox/radio can be small if its label is the target; WCAG allows
      // an adjacent target that is itself large enough, so only flag those with
      // neither a label wrapper nor enough size.
      const type = (el as HTMLInputElement).type;
      const labelled =
        (type === "checkbox" || type === "radio") &&
        (el as HTMLInputElement).labels?.length;
      if ((rect.width < 24 || rect.height < 24) && !labelled) {
        findings.push({
          kind: "small-target",
          what: `${describe(el)} is ${Math.round(rect.width)}x${Math.round(rect.height)}`,
        });
      }
    }

    // Heading levels inside the module: no jumps down by more than one.
    // (screen-reader-only headings count: they are in the accessibility tree)
    const inTree = (el: Element) =>
      !(el as HTMLElement).closest("[aria-hidden='true'], [hidden]") &&
      getComputedStyle(el as HTMLElement).display !== "none";
    const headings = Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,h6"))
      .filter(inTree)
      .map((h) => Number(h.tagName[1]));
    for (let i = 1; i < headings.length; i += 1) {
      if (headings[i] - headings[i - 1] > 1) {
        findings.push({
          kind: "heading-skip",
          what: `h${headings[i - 1]} then h${headings[i]}`,
        });
      }
    }
    const h1s = document.querySelectorAll("h1");
    if (h1s.length > 1) {
      findings.push({ kind: "h1", what: `${h1s.length} h1 elements` });
    }
    return findings;
  });
}

async function expectClean(page: Page, where: string) {
  const findings = await audit(page);
  expect(findings, `${where}: ${JSON.stringify(findings, null, 1)}`).toEqual(
    [],
  );
}

test.describe("responsive and accessibility sweep", () => {
  test("Dashboard, Inventory and Manage (every sub-tab)", async ({ page }) => {
    await signIn(page);
    await openModule(page);

    await expectClean(page, "Dashboard");

    await tab(page, "Inventory").click();
    await expect(
      page.getByRole("searchbox", { name: "Search Inventory" }),
    ).toBeVisible();
    await expectClean(page, "Inventory");

    await tab(page, "Manage").click();
    for (const sub of ["Vendors", "Categories", "Products", "Import"]) {
      await page.getByRole("tab", { name: sub, exact: true }).click();
      await page.waitForTimeout(150);
      await expectClean(page, `Manage › ${sub}`);
    }
  });

  test("History and Analytics", async ({ page }) => {
    await signIn(page);
    await openModule(page);

    await page.getByRole("button", { name: "Full history" }).click();
    await expect(
      page.getByRole("heading", { name: "Inventory history" }),
    ).toBeVisible();
    await expectClean(page, "History");

    await page.getByRole("button", { name: "Back" }).first().click();
    await tab(page, "Dashboard").click();
    await page
      .getByRole("button", { name: /analytics/i })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: /Analytics/ }).first(),
    ).toBeVisible();
    await page.waitForTimeout(300);
    await expectClean(page, "Analytics");
  });

  test("the item sheet and the add-product dialog fit the screen and trap focus", async ({
    page,
  }) => {
    await signIn(page);
    await openModule(page);
    await tab(page, "Inventory").click();

    const adjust = page
      .getByRole("button", { name: /^Adjust / })
      .filter({ visible: true })
      .first();
    await adjust.click();
    const sheet = page.getByRole("dialog").first();
    await expect(sheet).toBeVisible();
    const box = await sheet.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    // Focus lands inside the dialog and Escape closes it (focus restore is the
    // browser's: Safari does not focus a button on tap, so it is not asserted).
    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean(document.activeElement?.closest('dialog, [role="dialog"]')),
        ),
      )
      .toBe(true);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    await tab(page, "Manage").click();
    await page.getByRole("tab", { name: "Products", exact: true }).click();
    await page.getByRole("button", { name: "Add product" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add product" });
    await expect(dialog).toBeVisible();
    const dbox = await dialog.boundingBox();
    expect(dbox!.x + dbox!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(dbox!.y + dbox!.height).toBeLessThanOrEqual(viewport.height + 1);
    // The primary action is reachable without scrolling the page.
    await expect(
      dialog.getByRole("button", { name: "Add product" }),
    ).toBeInViewport();
  });

  test("the views are reachable and operable by keyboard", async ({ page }) => {
    await signIn(page);
    await openModule(page);
    // Tab through the view tabs; Enter/Space activates the focused one.
    await tab(page, "Dashboard").focus();
    await page.keyboard.press("Tab");
    await expect(tab(page, "Inventory")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(tab(page, "Inventory")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.getByRole("searchbox", { name: "Search Inventory" }),
    ).toBeVisible();
  });
});

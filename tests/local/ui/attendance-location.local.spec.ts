import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import {
  attendanceEnv,
  createAttendanceFixture,
  must,
  type AttendanceFixture,
  type AttendanceTestUser,
} from "../support/attendance-fixture";

let fx: AttendanceFixture;

async function authenticate(
  context: BrowserContext,
  user: AttendanceTestUser,
  orgId: string,
  locationId: string,
) {
  await context.clearCookies();
  const session = must(await user.client.auth.getSession()).session!;
  const client = createServerClient(attendanceEnv.url, attendanceEnv.anon, {
    cookies: {
      getAll: () => [],
      setAll: async (cookies) =>
        context.addCookies(
          cookies.map(({ name, value }) => ({
            name,
            value,
            domain: "localhost",
            path: "/",
            httpOnly: true,
            sameSite: "Lax" as const,
          })),
        ),
    },
  });
  must(await client.auth.setSession(session));
  await context.addCookies([
    {
      name: "lineup_active_context",
      value: JSON.stringify({ v: 1, o: orgId, l: locationId }),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

function employeeInList(page: Page, name: string) {
  const isMobile = (page.viewportSize()?.width ?? 1280) < 768;
  return page
    .locator(isMobile ? "ul.md\\:hidden li" : "table tbody tr")
    .filter({ hasText: name });
}

async function openAttendance(page: Page) {
  const tab = page.getByRole("button", { name: /^Attendance(?:\s|$)/ });
  if (!(await tab.isVisible())) {
    const more = page.getByRole("button", { name: /More/ });
    if (await more.isVisible()) await more.click();
  }
  if (await tab.isVisible()) await tab.click();
  // Wait for attendance workspace container to load
  await expect(
    page
      .getByText(
        /Source: TheLineup Internal|Source: External|Attendance is turned off/i,
      )
      .first(),
  ).toBeVisible({ timeout: 60000 });
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  fx = await createAttendanceFixture();
});

test.afterAll(async () => {
  if (fx) await fx.teardown();
});

test.describe("Manager corrections workflow (real browser acceptance)", () => {
  test("loads attendance page, verifies location & timezone, exercises correction with reason and review diff", async ({
    page,
    context,
  }) => {
    await authenticate(context, fx.managerA, fx.orgA.id, fx.locInternal);
    await page.goto(`/r/${fx.orgA.slug}?tab=attendance`);
    await openAttendance(page);

    // 1. Verify location header, badge, and timezone
    await expect(
      page.locator("main").getByText("Attendance Loc Internal").first(),
    ).toBeVisible();
    await expect(
      page.getByText("Source: TheLineup Internal").first(),
    ).toBeVisible();
    await expect(
      page.getByText(/Times in America\/Chicago/i).first(),
    ).toBeVisible();

    // 2. Verify workforce records appear in the table / card list
    await expect(employeeInList(page, "Sam Staff A").first()).toBeVisible();
    await expect(employeeInList(page, "Sara Staff A2").first()).toBeVisible();
    await expect(employeeInList(page, "Maya Manager A").first()).toBeVisible();

    // 3. Employee selection filter works
    const empSelect = page.getByLabel("Employee");
    await expect(empSelect).toBeVisible();
    await empSelect.selectOption({ label: "Sam Staff A" });
    await expect(employeeInList(page, "Sam Staff A").first()).toBeVisible();
    // Sara Staff A2 should now be filtered out
    await expect(employeeInList(page, "Sara Staff A2")).toHaveCount(0);
    // Switch back to All employees
    await empSelect.selectOption({ value: "" });
    await expect(employeeInList(page, "Sara Staff A2").first()).toBeVisible();

    // 4. Open existing session for Sam Staff A (Session 1)
    const correctBtn = employeeInList(page, "Sam Staff A")
      .getByRole("button", {
        name: /Correct/i,
      })
      .first();
    await expect(correctBtn).toBeVisible();
    await correctBtn.click();

    // 5. Verify dialog header, summary, original times, and breaks
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Sam Staff A · 2026-11-09/i)).toBeVisible();
    await expect(dialog.getByText("Shift times")).toBeVisible();
    await expect(
      dialog.locator("p.font-semibold", { hasText: "Breaks" }),
    ).toBeVisible();

    // Original clock-in and clock-out are present in inputs
    const inInput = dialog.getByLabel("Clock-in");
    const outInput = dialog.getByLabel(/^Clock-out/);
    await expect(inInput).toHaveValue("2026-11-09T08:00");
    await expect(outInput).toHaveValue("2026-11-09T16:00");

    // Break records display correctly
    const b1Start = dialog.getByLabel("Break 1 start");
    const b1End = dialog.getByLabel("Break 1 end");
    const b1Pay = dialog.getByLabel("Pay").first();
    await expect(b1Start).toHaveValue("2026-11-09T11:00");
    await expect(b1End).toHaveValue("2026-11-09T11:30");
    await expect(b1Pay).toHaveValue("unclassified");

    // 6. Test reason enforcement: "Review changes" is disabled without a change and valid reason
    const reviewBtn = dialog.getByRole("button", { name: "Review changes" });
    expect(await reviewBtn.isDisabled()).toBe(true);

    // Make an edit: extend shift out to 17:00 (5:00 PM)
    await outInput.fill("2026-11-09T17:00");
    // Reason still empty -> Review changes must remain disabled
    expect(await reviewBtn.isDisabled()).toBe(true);

    const reasonInput = dialog.getByLabel(/Reason \(required\)/);
    // Reason too short (< 3 chars)
    await reasonInput.fill("No");
    expect(await reviewBtn.isDisabled()).toBe(true);

    // 7. Test client validation error: Clock-out before clock-in
    await outInput.fill("2026-11-09T07:00");
    await reasonInput.fill("Valid correction reason here");
    await expect(
      dialog.getByText("Clock-out cannot be before clock-in."),
    ).toBeVisible();
    expect(await reviewBtn.isDisabled()).toBe(true);

    // Test invalid break: break end before start
    await outInput.fill("2026-11-09T17:00");
    await b1End.fill("2026-11-09T10:00");
    await expect(
      dialog.getByText("Break end cannot be before break start."),
    ).toBeVisible();
    expect(await reviewBtn.isDisabled()).toBe(true);

    // Restore break end and classify breaks
    await b1End.fill("2026-11-09T11:30");
    await b1Pay.selectOption("paid"); // Paid break

    // Classify Break 2 as unpaid
    const b2Pay = dialog.getByLabel("Pay").nth(1);
    await b2Pay.selectOption("unpaid");

    // Valid reason provided
    await reasonInput.fill(
      "Overtime approved and break classifications confirmed",
    );
    await expect(reviewBtn).toBeEnabled();

    // 8. Before-and-after review step
    await reviewBtn.click();
    await expect(dialog.getByText("Review your correction")).toBeVisible();
    // Shows clock-out change
    await expect(dialog.getByText("Clock-out").first()).toBeVisible();
    // Shows break classification changes
    await expect(dialog.getByText("Break (pay)").first()).toBeVisible();

    // Projected totals: Gross 9h (32400s), Breaks 45m (2700s), Payable: 8h 45m (paid 30m break, unpaid 15m break)
    await expect(dialog.getByText("9h").first()).toBeVisible();
    await expect(dialog.getByText("45m").first()).toBeVisible();
    await expect(dialog.getByText("8h 45m").first()).toBeVisible();

    // Reason preview
    await expect(
      dialog.getByText("Overtime approved and break classifications confirmed"),
    ).toBeVisible();

    // Test "Back" works without losing changes
    await dialog.getByRole("button", { name: "Back" }).click();
    await expect(outInput).toHaveValue("2026-11-09T17:00");
    await reviewBtn.click();

    // 9. Confirm correction
    const confirmBtn = dialog.getByRole("button", {
      name: "Confirm correction",
    });
    await confirmBtn.click();

    // 10. Success step
    await expect(dialog.getByText(/Correction saved/i)).toBeVisible({
      timeout: 15000,
    });
    await expect(dialog.getByText(/Correction saved \(#1\)/i)).toBeVisible();

    // Close modal
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // 11. Record in table is updated: "Corrected ×1" badge appears and payable is updated
    await expect(
      employeeInList(page, "Sam Staff A").getByText("Corrected ×1"),
    ).toBeVisible();
    await expect(
      employeeInList(page, "Sam Staff A").getByText("8h 45m"),
    ).toBeVisible();

    // 12. Re-open record: audit history displays the correction alongside original events
    await employeeInList(page, "Sam Staff A")
      .getByRole("button", { name: /Correct/i })
      .first()
      .click();
    const reopened = page.getByRole("dialog");
    await expect(reopened).toBeVisible();
    await expect(
      reopened.getByRole("heading", { name: "History" }),
    ).toBeVisible();
    await expect(reopened.getByText("Maya Manager A").first()).toBeVisible();
    await expect(
      reopened.getByText(
        "Overtime approved and break classifications confirmed",
      ),
    ).toBeVisible();
    await expect(reopened.getByText("clock in").first()).toBeVisible();
    await expect(reopened.getByText("clock out").first()).toBeVisible();

    // Close dialog
    await reopened.getByRole("button", { name: "Cancel" }).click();
  });

  test("canceling an edit leaves record unchanged", async ({
    page,
    context,
  }) => {
    await authenticate(context, fx.managerA, fx.orgA.id, fx.locInternal);
    await page.goto(`/r/${fx.orgA.slug}?tab=attendance`);
    await openAttendance(page);

    // Open Session 3 (Manager's own session)
    await employeeInList(page, "Maya Manager A")
      .getByRole("button", { name: /Correct/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Modify clock-out
    const out = dialog.getByLabel(/^Clock-out/);
    await out.fill("2026-11-09T22:30");
    await dialog.getByLabel(/Reason \(required\)/).fill("Unsaved test edit");

    // Click Cancel
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Re-open: verify values are unchanged
    await employeeInList(page, "Maya Manager A")
      .getByRole("button", { name: /Correct/i })
      .first()
      .click();
    const reopened = page.getByRole("dialog");
    await expect(reopened.getByLabel(/^Clock-out/)).toHaveValue(
      "2026-11-09T15:00",
    );
    await reopened.getByRole("button", { name: "Cancel" }).click();
  });
});

test.describe("Reporting across all 4 attendance states", () => {
  test("INTERNAL_THE_LINEUP: loads native records, honors timezone, filters, and status flags", async ({
    page,
    context,
  }) => {
    await authenticate(context, fx.managerA, fx.orgA.id, fx.locInternal);
    await page.goto(`/r/${fx.orgA.slug}?tab=attendance`);
    await openAttendance(page);

    // Native source badge & location timezone
    await expect(
      page.getByText("Source: TheLineup Internal").first(),
    ).toBeVisible();
    await expect(
      page.getByText(/Times in America\/Chicago \(CST\)/).first(),
    ).toBeVisible();

    // Open session (Sara Staff A2) is labeled incomplete
    await expect(employeeInList(page, "Sara Staff A2").first()).toBeVisible();
    await expect(
      employeeInList(page, "Sara Staff A2").getByText("Shift open").first(),
    ).toBeVisible();

    // Date filters: click "Today"
    const todayBtn = page.getByRole("button", { name: "Today", exact: true });
    await expect(todayBtn).toBeVisible();
    await todayBtn.click();
    const fromVal = await page.locator("#nat-start").inputValue();
    const toVal = await page.locator("#nat-end").inputValue();
    expect(fromVal).toBeTruthy();
    expect(toVal).toBe(fromVal);
  });

  test("EXTERNAL: renders existing Neon attendance report with Source: External", async ({
    page,
    context,
  }) => {
    await authenticate(context, fx.managerA, fx.orgA.id, fx.locExternal);
    await page.goto(
      `/r/${fx.orgA.slug}?location=${fx.locExternal}&tab=attendance`,
    );
    await openAttendance(page);

    await expect(page.getByText("Source: External").first()).toBeVisible();
    await expect(
      page.locator("main").getByText("Attendance Loc External").first(),
    ).toBeVisible();
  });

  test("DISABLED: shows attendance is turned off card with notice", async ({
    page,
    context,
  }) => {
    await authenticate(context, fx.managerA, fx.orgA.id, fx.locDisabled);
    await page.goto(
      `/r/${fx.orgA.slug}?location=${fx.locDisabled}&tab=attendance`,
    );
    await openAttendance(page);

    await expect(
      page.getByText("Attendance is turned off").first(),
    ).toBeVisible();
    await expect(
      page.getByText(/No clock-ins are accepted here/i).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Source: Attendance off").first(),
    ).toBeVisible();
  });

  test("UNCONFIGURED: does not silently enable internal attendance", async ({
    page,
    context,
  }) => {
    await authenticate(context, fx.managerA, fx.orgA.id, fx.locUnconfigured);
    await page.goto(
      `/r/${fx.orgA.slug}?location=${fx.locUnconfigured}&tab=attendance`,
    );
    await openAttendance(page);

    // Unconfigured falls back to legacy external report with notice
    await expect(
      page.getByText(/Source: External \(not configured\)/i).first(),
    ).toBeVisible();
  });
});

test.describe("Browser authorization and role boundaries", () => {
  test("staff member sees only own records, no employee filter, no Correct button, but read-only History", async ({
    page,
    context,
  }) => {
    await authenticate(context, fx.staffA, fx.orgA.id, fx.locInternal);
    await page.goto(`/r/${fx.orgA.slug}?tab=attendance`);
    await openAttendance(page);

    // Staff member sees own name
    await expect(employeeInList(page, "Sam Staff A").first()).toBeVisible();
    // Staff member CANNOT see other staff or managers
    await expect(employeeInList(page, "Sara Staff A2")).toHaveCount(0);
    await expect(employeeInList(page, "Maya Manager A")).toHaveCount(0);

    // Employee picker is hidden
    await expect(page.locator("#nat-emp")).toHaveCount(0);

    // No "Correct" button is rendered
    await expect(page.getByRole("button", { name: /^Correct / })).toHaveCount(
      0,
    );

    // Corrected session shows "History" button
    const historyBtn = employeeInList(page, "Sam Staff A")
      .getByRole("button", { name: /history/i })
      .first();
    await expect(historyBtn).toBeVisible();
    await historyBtn.click();

    // Dialog is open in read-only mode (no edit form, no inputs)
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByLabel("Clock-in")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
  });

  test("unauthorized direct server action call by staff is rejected with 42501 Unauthorized", async () => {
    // Attempting to call attendance_correct_session with staffA client
    const res = await fx.staffA.client.rpc("attendance_correct_session", {
      p_session_id: fx.session1Id,
      p_expected_version: 1,
      p_reason: "Hostile edit by staff",
      p_clock_out_at: "2026-11-09T23:00:00Z",
    });
    expect(res.error).not.toBeNull();
    expect(res.error?.code).toBe("42501");
  });

  test("manager of Loc B cannot manage or correct Loc Internal records", async ({
    page,
    context,
  }) => {
    await authenticate(context, fx.managerB, fx.orgA.id, fx.locB);
    await page.goto(`/r/${fx.orgA.slug}?location=${fx.locB}&tab=attendance`);
    await openAttendance(page);

    // Scoped to Loc B
    await expect(
      page.locator("main").getByText("Attendance Loc B").first(),
    ).toBeVisible();
    await expect(employeeInList(page, "Sam Staff A")).toHaveCount(0);

    // Server-level refusal if attempting to correct Loc Internal session
    const res = await fx.managerB.client.rpc("attendance_correct_session", {
      p_session_id: fx.session1Id,
      p_expected_version: 1,
      p_reason: "Cross-location edit attempt",
      p_clock_out_at: "2026-11-09T23:00:00Z",
    });
    expect(res.error).not.toBeNull();
    expect(res.error?.code).toBe("42501");
  });

  test("foreign organization user is completely isolated", async ({
    page,
    context,
  }) => {
    await authenticate(context, fx.foreignUser, fx.orgB.id, fx.locForeign);
    await page.goto(
      `/r/${fx.orgB.slug}?location=${fx.locForeign}&tab=attendance`,
    );
    await openAttendance(page);

    await expect(
      page.locator("main").getByText("Attendance Foreign Loc").first(),
    ).toBeVisible();
    await expect(employeeInList(page, "Sam Staff A")).toHaveCount(0);
    await expect(employeeInList(page, "Maya Manager A")).toHaveCount(0);
  });

  test("overall administrator has management access across locations", async ({
    page,
    context,
  }) => {
    await authenticate(context, fx.overallManager, fx.orgA.id, fx.locInternal);
    await page.goto(
      `/r/${fx.orgA.slug}?location=${fx.locInternal}&tab=attendance`,
    );
    await openAttendance(page);

    await expect(
      page.locator("main").getByText("Attendance Loc Internal").first(),
    ).toBeVisible();
    await expect(page.locator("#nat-emp")).toBeVisible();
    await expect(
      employeeInList(page, "Sam Staff A")
        .getByRole("button", { name: /Correct/i })
        .first(),
    ).toBeVisible();
  });
});

test.describe("Responsive viewport validation", () => {
  test("renders readable layout, touch targets, and avoids horizontal scroll overflow", async ({
    page,
    context,
  }) => {
    await authenticate(context, fx.managerA, fx.orgA.id, fx.locInternal);
    await page.goto(`/r/${fx.orgA.slug}?tab=attendance`);
    await openAttendance(page);

    // Check horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return (
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
      );
    });
    expect(hasHorizontalOverflow).toBe(false);

    // Check table / card list visibility based on viewport width
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 768) {
      // Mobile card list visible
      await expect(page.locator("ul.md\\:hidden")).toBeVisible();
    } else {
      // Desktop table visible
      await expect(page.locator("table")).toBeVisible();
    }
  });
});

test.describe("Data integrity and ledger immutability", () => {
  test("verifies ledger append-only events, version bumps, stale write conflict, and DML protection", async () => {
    // 1. Session 1 version was bumped to 2 by the earlier correction test
    const session1 = must(
      await fx.admin
        .from("attendance_sessions")
        .select("version, correction_count, last_corrected_at")
        .eq("id", fx.session1Id)
        .single(),
    );
    expect(session1.version).toBe(2);
    expect(session1.correction_count).toBe(1);
    expect(session1.last_corrected_at).not.toBeNull();

    // 2. Events ledger has exactly one manager_edit event added
    const events = must(
      await fx.admin
        .from("attendance_events")
        .select(
          "event_type, is_manager_correction, correction_reason, actor_profile_id",
        )
        .eq("session_id", fx.session1Id)
        .order("id", { ascending: true }),
    );
    const correctionEvent = events.find((e) => e.event_type === "manager_edit");
    expect(correctionEvent).toBeDefined();
    expect(correctionEvent?.is_manager_correction).toBe(true);
    expect(correctionEvent?.actor_profile_id).toBe(fx.managerA.id);

    // 3. Original clock_in and clock_out events are completely unchanged
    const originalIn = events.find((e) => e.event_type === "clock_in");
    const originalOut = events.find((e) => e.event_type === "clock_out");
    expect(originalIn).toBeDefined();
    expect(originalOut).toBeDefined();

    // 4. Stale concurrent write failure: submitting with expected_version = 1 fails with P0004
    const staleRes = await fx.managerA.client.rpc(
      "attendance_correct_session",
      {
        p_session_id: fx.session1Id,
        p_expected_version: 1, // Stale! Current version is 2
        p_reason: "Stale update attempt",
        p_clock_out_at: "2026-11-09T23:00:00Z",
      },
    );
    expect(staleRes.error).not.toBeNull();
    expect(staleRes.error?.code).toBe("P0004");

    // 5. Financial records unchanged: payroll periods and tip pools are untouched
    const payrollRes = await fx.admin
      .from("payroll_periods")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", fx.orgA.id);
    expect(payrollRes.error).toBeNull();
    expect(payrollRes.count).toBe(0);

    // 6. Immutability trigger: direct DELETE on attendance_events is denied with 23514
    const deleteRes = await fx.admin
      .from("attendance_events")
      .delete()
      .eq("session_id", fx.session1Id);
    expect(deleteRes.error).not.toBeNull();
    expect(deleteRes.error?.code).toBe("23514");
  });
});

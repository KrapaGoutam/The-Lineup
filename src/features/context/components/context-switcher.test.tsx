import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { AvailableContextSummary } from "@/features/context/domain/active-context";

import { ContextScopeBoundary } from "./context-scope-boundary";
import { ContextSwitcher } from "./context-switcher";

const ctx = (
  org: string,
  slug: string,
  locId: string,
  loc: string,
): AvailableContextSummary => ({
  organizationId: `org-${slug}`,
  organizationSlug: slug,
  organizationName: org,
  locationId: locId,
  locationName: loc,
  timeZone: "America/Chicago",
});

const WEBSTER = ctx("Monks", "monks", "l-web", "Webster");
const NASA = ctx("Monks", "monks", "l-nasa", "NASA");
const DOWNTOWN = ctx("Liquor Tap", "tap", "l-down", "Downtown");
const ALL = [DOWNTOWN, WEBSTER, NASA];

function setup(props: Partial<Parameters<typeof ContextSwitcher>[0]> = {}) {
  const onSelect = vi.fn();
  const utils = render(
    <ContextSwitcher
      active={WEBSTER}
      contexts={ALL}
      onSelect={onSelect}
      {...props}
    />,
  );
  return { onSelect, ...utils };
}

describe("ContextSwitcher (SW-01, SW-21)", () => {
  it("SW-01: shows the active organization and location", () => {
    setup();
    const trigger = screen.getByRole("button", { name: /switch workspace/i });
    expect(trigger).toHaveTextContent("Monks");
    expect(trigger).toHaveTextContent("Webster");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAccessibleName(
      "Switch workspace. Current: Monks, Webster",
    );
  });

  it("lists locations grouped by organization with the current one checked (not color-only)", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: /switch workspace/i }));
    expect(
      screen.getByRole("button", { name: /switch workspace/i }),
    ).toHaveAttribute("aria-expanded", "true");
    const groups = screen.getAllByRole("group");
    expect(groups.map((g) => g.getAttribute("aria-label"))).toEqual([
      "Liquor Tap",
      "Monks",
    ]);
    const current = screen.getByRole("menuitemradio", { name: /Webster/ });
    expect(current).toHaveAttribute("aria-checked", "true");
    expect(current).toHaveTextContent("Current"); // textual, not color-only
    expect(screen.getByRole("menuitemradio", { name: "NASA" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("selecting another location requests a switch by stable id and closes the menu", async () => {
    const user = userEvent.setup();
    const { onSelect } = setup();
    await user.click(screen.getByRole("button", { name: /switch workspace/i }));
    await user.click(screen.getByRole("menuitemradio", { name: "Downtown" }));
    expect(onSelect).toHaveBeenCalledWith(DOWNTOWN);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("selecting the current location does not navigate", async () => {
    const user = userEvent.setup();
    const { onSelect } = setup();
    await user.click(screen.getByRole("button", { name: /switch workspace/i }));
    await user.click(screen.getByRole("menuitemradio", { name: /Webster/ }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("Escape closes and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    setup();
    const trigger = screen.getByRole("button", { name: /switch workspace/i });
    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("outside click closes the menu", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: /switch workspace/i }));
    await user.click(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("is keyboard navigable: opens focused on the current item, arrows move, Enter selects", async () => {
    const user = userEvent.setup();
    const { onSelect } = setup();
    screen.getByRole("button", { name: /switch workspace/i }).focus();
    await user.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("menuitemradio", { name: /Webster/ }),
    ).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitemradio", { name: "NASA" })).toHaveFocus();
    await user.keyboard("{ArrowDown}"); // wraps
    expect(
      screen.getByRole("menuitemradio", { name: "Downtown" }),
    ).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("menuitemradio", { name: "NASA" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(
      screen.getByRole("menuitemradio", { name: "Downtown" }),
    ).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith(DOWNTOWN);
  });

  it("a single-location user gets a plain indicator, no menu to open", () => {
    setup({ contexts: [WEBSTER] });
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByTestId("context-indicator")).toHaveTextContent(
      "Webster",
    );
  });

  it("a failed candidate load degrades to the indicator, never to an empty menu", () => {
    setup({ contextsUnavailable: true });
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByTestId("context-indicator")).toHaveAttribute(
      "title",
      expect.stringContaining("could not be loaded"),
    );
  });

  it("disables the trigger while a switch is pending", () => {
    setup({ switchingTo: DOWNTOWN });
    expect(
      screen.getByRole("button", { name: /switch workspace/i }),
    ).toBeDisabled();
  });
});

describe("ContextScopeBoundary (SW-15, async isolation)", () => {
  function Workspace({
    label,
    pending,
  }: {
    label: string;
    pending: Promise<string>;
  }) {
    const [board, setBoard] = useState(`${label}-board`);
    useEffect(() => {
      void pending.then((value) => setBoard(value));
    }, [pending]);
    return <div data-testid="board">{board}</div>;
  }

  it("SW-15: changing location discards client state and re-seeds from the new props", async () => {
    const never = new Promise<string>(() => {});
    const { rerender } = render(
      <ContextScopeBoundary profileId="p" organizationId="o" locationId="a">
        <Workspace label="A" pending={never} />
      </ContextScopeBoundary>,
    );
    expect(screen.getByTestId("board")).toHaveTextContent("A-board");
    rerender(
      <ContextScopeBoundary profileId="p" organizationId="o" locationId="b">
        <Workspace label="B" pending={never} />
      </ContextScopeBoundary>,
    );
    expect(screen.getByTestId("board")).toHaveTextContent("B-board");
  });

  it("an in-flight operation from the old location cannot update the new workspace", async () => {
    let resolveOld!: (v: string) => void;
    const oldPending = new Promise<string>((r) => (resolveOld = r));
    const never = new Promise<string>(() => {});
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = render(
      <ContextScopeBoundary profileId="p" organizationId="o" locationId="a">
        <Workspace label="A" pending={oldPending} />
      </ContextScopeBoundary>,
    );
    rerender(
      <ContextScopeBoundary profileId="p" organizationId="o" locationId="b">
        <Workspace label="B" pending={never} />
      </ContextScopeBoundary>,
    );
    await act(async () => {
      resolveOld("STALE-A-DATA");
      await oldPending;
    });
    await waitFor(() =>
      expect(screen.getByTestId("board")).toHaveTextContent("B-board"),
    );
    expect(screen.queryByText("STALE-A-DATA")).toBeNull();
    errors.mockRestore();
  });

  it("SW-18: returning to a previous location (back/forward) re-seeds, never reuses cached client state", () => {
    const never = new Promise<string>(() => {});
    const view = (loc: string, label: string) => (
      <ContextScopeBoundary profileId="p" organizationId="o" locationId={loc}>
        <Workspace label={label} pending={never} />
      </ContextScopeBoundary>
    );
    const { rerender } = render(view("a", "A1"));
    rerender(view("b", "B"));
    rerender(view("a", "A2-fresh-server-data"));
    expect(screen.getByTestId("board")).toHaveTextContent(
      "A2-fresh-server-data-board",
    );
  });

  it("organization or profile change also resets; same identity keeps state", () => {
    const never = new Promise<string>(() => {});
    const { rerender } = render(
      <ContextScopeBoundary profileId="p" organizationId="o" locationId="a">
        <Workspace label="A" pending={never} />
      </ContextScopeBoundary>,
    );
    rerender(
      <ContextScopeBoundary profileId="p" organizationId="o" locationId="a">
        <Workspace label="IGNORED" pending={never} />
      </ContextScopeBoundary>,
    );
    expect(screen.getByTestId("board")).toHaveTextContent("A-board");
    rerender(
      <ContextScopeBoundary profileId="p" organizationId="o2" locationId="a">
        <Workspace label="O2" pending={never} />
      </ContextScopeBoundary>,
    );
    expect(screen.getByTestId("board")).toHaveTextContent("O2-board");
  });
});

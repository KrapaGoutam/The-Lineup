import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { downloadFile } from "@/lib/download-file";

import {
  applyCatalogCommand,
  type CatalogContext,
} from "../domain/catalog-engine";
import { buildDemoCatalog } from "../domain/demo-catalog";
import type { CatalogState } from "../domain/inventory-types";
import {
  activeDraftsOf,
  clearDraftDemo,
  draftsOf,
  fillDraftDemo,
  markSentDemo,
  openDraftDemo,
  saveDraftDemo,
  syncDraftDemo,
  type DraftEngineResult,
} from "../domain/order-draft-demo";
import { pageSentDrafts } from "../domain/order-draft-sent";
import type { DraftOpResult, OrderDraftApi } from "../hooks/use-order-drafts";
import { OrderDraftsView } from "./order-drafts-view";
import type { DraftGuard } from "./order-draft-editor";

beforeAll(() => {
  // jsdom has no <dialog> modal behaviour; the primitive only needs open/close.
  const proto = HTMLDialogElement.prototype;
  proto.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});
afterEach(cleanup);

// The browser download itself is not under test (jsdom has no object URLs).
vi.mock("@/lib/download-file", () => ({
  downloadFile: vi.fn(),
  base64ToBlob: vi.fn(),
}));

let counter = 0;
const ctx = (actorName: string): CatalogContext => ({
  actorName,
  now: new Date("2026-10-27T16:00:00Z"),
  newId: () => `draft-${++counter}`,
});

type Controls = {
  state: () => CatalogState;
  /** Another manager's change, applied to the "database" directly. */
  external: (fn: (state: CatalogState) => DraftEngineResult) => void;
  /** Another manager's change the screen has not read yet (it still shows the old state). */
  externalQuiet: (fn: (state: CatalogState) => DraftEngineResult) => void;
  api: OrderDraftApi;
  guard: () => DraftGuard | null;
  fail: (message: string) => void;
  spies: {
    save: ReturnType<typeof vi.fn>;
    reload: ReturnType<typeof vi.fn>;
    open: ReturnType<typeof vi.fn>;
    markSent: ReturnType<typeof vi.fn>;
  };
};

const runExport = vi.fn(async () => ({
  ok: true as const,
  filename: "order.csv",
  mime: "text/csv",
  data: "x",
}));

/** The real client + engine logic with a fake "server": the demo engine. */
function Harness({
  initial,
  onControls,
  drafts: forcedDrafts,
  loadError = null,
}: {
  initial: CatalogState;
  onControls: (controls: Controls) => void;
  drafts?: null;
  loadError?: string | null;
}) {
  const [state, setState] = useState(initial);
  const latest = useRef(state);
  const failure = useRef<string | null>(null);
  const guard = useRef<DraftGuard | null>(null);

  const built = useMemo(() => {
    const spies = {
      save: vi.fn(),
      reload: vi.fn(),
      open: vi.fn(),
      markSent: vi.fn(),
    };
    const run = (
      actor: string,
      step: (s: CatalogState, c: CatalogContext) => DraftEngineResult,
    ): DraftOpResult => {
      if (failure.current) {
        const error = failure.current;
        failure.current = null;
        return { ok: false, error };
      }
      const result = step(latest.current, ctx(actor));
      if (!result.ok) {
        return { ok: false, error: result.error, conflict: result.conflict };
      }
      latest.current = result.state;
      setState(result.state);
      return {
        ok: true,
        drafts: activeDraftsOf(result.state),
        draftId: result.draftId,
        changed: result.changed,
        sent: result.sent,
      };
    };
    const api: OrderDraftApi = {
      open: async (vendorId) => {
        spies.open(vendorId);
        return run("Mia", (s, c) => openDraftDemo(s, vendorId, c));
      },
      save: async (input) => {
        spies.save(input);
        return run("Mia", (s, c) => saveDraftDemo(s, input, c));
      },
      fill: async (draftId, expectedVersion, mode) =>
        run("Mia", (s, c) =>
          fillDraftDemo(s, { draftId, expectedVersion, mode }, c),
        ),
      clear: async (draftId, expectedVersion) =>
        run("Mia", (s, c) =>
          clearDraftDemo(s, { draftId, expectedVersion }, c),
        ),
      sync: async (draftId, expectedVersion) =>
        run("Mia", (s, c) => syncDraftDemo(s, { draftId, expectedVersion }, c)),
      markSent: async (draftId, expectedVersion) => {
        spies.markSent(draftId, expectedVersion);
        return run("Mia", (s, c) =>
          markSentDemo(s, { draftId, expectedVersion }, c),
        );
      },
      listSent: async (page) => ({
        ok: true,
        page: pageSentDrafts(draftsOf(latest.current), page),
      }),
      getSent: async (draftId) => {
        const draft = draftsOf(latest.current).find(
          (d) => d.id === draftId && d.status === "sent",
        );
        return draft
          ? { ok: true, draft }
          : { ok: false, error: "That sent order is not available." };
      },
      reload: async () => {
        spies.reload();
      },
    };
    const controls: Controls = {
      state: () => latest.current,
      external: (fn) => {
        act(() => {
          const result = fn(latest.current);
          if (!result.ok) throw new Error(result.error);
          latest.current = result.state;
          setState(result.state);
        });
      },
      externalQuiet: (fn) => {
        const result = fn(latest.current);
        if (!result.ok) throw new Error(result.error);
        latest.current = result.state;
      },
      api,
      guard: () => guard.current,
      fail: (message) => {
        failure.current = message;
      },
      spies,
    };
    return controls;
  }, []);
  const api = built.api;
  useEffect(() => onControls(built), [built, onControls]);

  const [selected, setSelected] = useState<string | null>(null);
  return (
    <OrderDraftsView
      snapshot={{ ...state, loadedAt: "2026-10-27T16:00:00Z" }}
      drafts={forcedDrafts === null ? null : activeDraftsOf(state)}
      loading={false}
      loadError={loadError}
      api={api}
      selectedDraftId={selected}
      onSelectDraft={setSelected}
      onGuard={(g) => {
        guard.current = g;
      }}
      navigate={(go) => go()}
      viewerName="Mia"
      timeZone="America/New_York"
      runExport={runExport}
    />
  );
}

function mount(
  options: {
    initial?: CatalogState;
    withDraft?: boolean;
    drafts?: null;
    loadError?: string | null;
  } = {},
) {
  const controls: MutableRefObject<Controls | null> = { current: null };
  let initial = options.initial ?? buildDemoCatalog();
  if (options.withDraft) {
    const faust = initial.vendors.find((v) => v.name === "Faust")!.id;
    const opened = openDraftDemo(initial, faust, ctx("Mia"));
    if (!opened.ok) throw new Error(opened.error);
    initial = opened.state;
  }
  const user = userEvent.setup();
  render(
    <Harness
      initial={initial}
      onControls={(c) => {
        controls.current = c;
      }}
      drafts={options.drafts}
      loadError={options.loadError}
    />,
  );
  return { user, controls: controls as MutableRefObject<Controls> };
}

const qty = () =>
  screen.getByLabelText(/Order quantity for Tito's Handmade Vodka/);
const draftNow = (c: MutableRefObject<Controls>) =>
  activeDraftsOf(c.current.state())[0]!;
const saveButton = () => screen.getByRole("button", { name: "Save" });

describe("Order Drafts view states (VOD-006, loading/empty/error)", () => {
  it("shows a loading state until the first read, and a retryable error", async () => {
    const loading = mount({ drafts: null });
    expect(screen.getByText("Loading order drafts…")).toBeInTheDocument();
    cleanup();
    const failed = mount({
      drafts: null,
      loadError: "Couldn't reach the server.",
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't reach the server.",
    );
    await failed.user.click(screen.getByRole("button", { name: "Try again" }));
    expect(failed.controls.current.spies.reload).toHaveBeenCalled();
    void loading;
  });

  it("shows an empty state, and never offers the Unassigned vendor", () => {
    mount();
    expect(screen.getByText(/No order drafts yet/)).toBeInTheDocument();
    const select = screen.getByLabelText("Start a draft for");
    const names = within(select)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(names).toEqual(["Del Papa", "Faust"]);
    expect(names).not.toContain("Unassigned");
    expect(
      screen.getByText(/Items under Unassigned can't be ordered/),
    ).toBeInTheDocument();
  });

  it("creates a draft for the chosen vendor and opens it; the vendor leaves the picker", async () => {
    const { user, controls } = mount();
    await user.selectOptions(
      screen.getByLabelText("Start a draft for"),
      "Faust",
    );
    await user.click(
      screen.getByRole("button", { name: "Create Order Draft" }),
    );
    expect(await screen.findByTestId("order-draft-editor")).toBeInTheDocument();
    expect(controls.current.spies.open).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Faust" })).toBeInTheDocument();
    const options = within(screen.getByLabelText("Start a draft for"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options).toEqual(["Del Papa"]);
  });

  it("surfaces a refusal from creating a draft", async () => {
    const { user, controls } = mount();
    controls.current.fail(
      "That vendor is inactive. Reactivate it before drafting a new order.",
    );
    await user.click(
      screen.getByRole("button", { name: "Create Order Draft" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/inactive/);
  });
});

describe("editor: Suggested is read-only; Order Qty is the manager's", () => {
  it("shows the suggestion as text next to a separate, labelled Order Qty", () => {
    mount({ withDraft: true });
    const line = screen.getByTestId("draft-line");
    expect(within(line).getByTestId("draft-suggested")).toHaveTextContent("9");
    // The suggestion is not an input and cannot be edited.
    expect(within(line).queryByLabelText(/suggested/i)).toBeNull();
    expect(qty()).toHaveValue("");
    expect(
      screen.getByLabelText(/Item note for Tito's Handmade Vodka/),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        /Include Tito's Handmade Vodka 750 mL in the order/,
      ),
    ).toBeChecked();
  });

  it("quantity-only save: type 5, Save, reload from the 'database', still 5", async () => {
    const { user, controls } = mount({ withDraft: true });
    await user.type(qty(), "5");
    expect(screen.getByTestId("draft-save-bar")).toHaveAttribute(
      "data-state",
      "dirty",
    );
    await user.click(saveButton());
    expect(await screen.findByText("Order draft saved.")).toBeInTheDocument();
    expect(screen.getByTestId("draft-save-bar")).toHaveAttribute(
      "data-state",
      "clean",
    );
    // Only the quantity went over the wire.
    expect(controls.current.spies.save).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: 1,
        vendorNote: null,
        lines: [
          expect.objectContaining({
            orderQty: 5,
            itemNote: null,
            included: true,
          }),
        ],
      }),
    );
    expect(draftNow(controls).lines[0]!.orderQty).toBe(5);
    expect(draftNow(controls).version).toBe(2);
    // A fresh mount over the saved state (a reload) still shows 5.
    cleanup();
    mount({ initial: controls.current.state() });
    expect(qty()).toHaveValue("5");
  });

  it("blank → 0 saves as 0; 5 → blank clears it", async () => {
    const { user, controls } = mount({ withDraft: true });
    await user.type(qty(), "0");
    await user.click(saveButton());
    await screen.findByText("Order draft saved.");
    expect(draftNow(controls).lines[0]!.orderQty).toBe(0);
    await user.clear(qty());
    await user.type(qty(), "5");
    await user.click(saveButton());
    await waitFor(() => expect(draftNow(controls).lines[0]!.orderQty).toBe(5));
    await user.clear(qty());
    await user.click(saveButton());
    await waitFor(() =>
      expect(draftNow(controls).lines[0]!.orderQty).toBeNull(),
    );
  });

  it("typing the same value back is not a change: nothing to save, no RPC", async () => {
    const { user, controls } = mount({ withDraft: true });
    await user.type(qty(), "5");
    await user.click(saveButton());
    await screen.findByText("Order draft saved.");
    controls.current.spies.save.mockClear();
    await user.clear(qty());
    await user.type(qty(), "5.0");
    expect(screen.getByTestId("draft-save-bar")).toHaveAttribute(
      "data-state",
      "clean",
    );
    await user.click(saveButton());
    expect(controls.current.spies.save).not.toHaveBeenCalled();
  });

  it("rejects an invalid quantity clearly and sends nothing", async () => {
    const { user, controls } = mount({ withDraft: true });
    await user.type(qty(), "abc");
    await user.tab();
    expect(qty()).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText(/Enter a number for Tito's Handmade Vodka/),
    ).toBeInTheDocument();
    await user.click(saveButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Nothing was saved/,
    );
    expect(controls.current.spies.save).not.toHaveBeenCalled();
    // The error is tied to the field for assistive tech.
    const describedBy = qty().getAttribute("aria-describedby")!;
    expect(document.getElementById(describedBy)).toHaveTextContent(
      /Enter a number/,
    );
  });

  it("keeps the typed edits and says so when the save fails; never shows Saved", async () => {
    const { user, controls } = mount({ withDraft: true });
    await user.type(qty(), "7");
    controls.current.fail(
      "Couldn't reach the server, so we can't confirm that was saved.",
    );
    await user.click(saveButton());
    const alert = await screen.findByTestId("draft-error");
    expect(alert).toHaveTextContent(/can't confirm that was saved/);
    expect(alert).toHaveTextContent(/have not been saved/);
    expect(screen.queryByText("Order draft saved.")).toBeNull();
    expect(qty()).toHaveValue("7");
    expect(screen.getByTestId("draft-save-bar")).toHaveAttribute(
      "data-state",
      "dirty",
    );
    // Retry works.
    await user.click(saveButton());
    expect(await screen.findByText("Order draft saved.")).toBeInTheDocument();
    expect(draftNow(controls).lines[0]!.orderQty).toBe(7);
  });

  it("saves item notes (newlines kept) and the vendor note", async () => {
    const { user, controls } = mount({ withDraft: true });
    await user.type(
      screen.getByLabelText(/Item note for Tito's/),
      "Weekend{Enter}stock",
    );
    await user.type(screen.getByLabelText("Vendor note"), "Deliver Thursday");
    await user.click(saveButton());
    await screen.findByText("Order draft saved.");
    const draft = draftNow(controls);
    expect(draft.lines[0]!.itemNote).toBe("Weekend\nstock");
    expect(draft.vendorNote).toBe("Deliver Thursday");
  });

  it("rejects over-long notes with a message instead of truncating", async () => {
    const { user, controls } = mount({ withDraft: true });
    const note = screen.getByLabelText(/Item note for Tito's/);
    await user.click(note);
    await user.paste("x".repeat(201));
    await user.tab();
    expect(screen.getByText(/at most 200 characters/)).toBeInTheDocument();
    await user.click(saveButton());
    expect(controls.current.spies.save).not.toHaveBeenCalled();
  });
});

describe("include / exclude and totals (VOD-015, VOD-020, VOD-021)", () => {
  it("excluding keeps the line visible and marked, and drops it from the planned total", async () => {
    const { user, controls } = mount({ withDraft: true });
    await user.type(qty(), "6");
    expect(screen.getByTestId("draft-planned-total")).toHaveTextContent("6");
    expect(screen.getByTestId("draft-suggested-total")).toHaveTextContent("9");
    await user.click(
      screen.getByLabelText(
        /Include Tito's Handmade Vodka 750 mL in the order/,
      ),
    );
    const line = screen.getByTestId("draft-line");
    expect(line).toHaveAttribute("data-included", "false");
    expect(within(line).getByText("Excluded")).toBeInTheDocument();
    expect(screen.getByTestId("draft-planned-total")).toHaveTextContent("0");
    await user.click(saveButton());
    await screen.findByText("Order draft saved.");
    expect(draftNow(controls).lines[0]).toMatchObject({
      included: false,
      orderQty: 6,
    });
    // Still visible after the save, with its values.
    expect(screen.getByTestId("draft-line")).toHaveAttribute(
      "data-included",
      "false",
    );
    expect(qty()).toHaveValue("6");
  });

  it("totals are quantities, never money, and count lines that still need a quantity", () => {
    mount({ withDraft: true });
    const totals = screen.getByTestId("draft-totals");
    expect(totals).not.toHaveTextContent("$");
    expect(totals).toHaveTextContent(/not dollars/);
    expect(screen.getByTestId("draft-manual-count")).toHaveTextContent("1");
  });
});

describe("Order needed (no Par) lines (VOD-012)", () => {
  function noParState() {
    const state = buildDemoCatalog();
    const gin = state.products.find((p) => p.name === "House Rail Gin")!.id;
    const stock = state.stock.find((s) => s.productId === gin)!;
    const result = applyCatalogCommand(
      state,
      {
        type: "stockSetLevels",
        productId: gin,
        cutoff: 6,
        warning: null,
        par: null,
        expectedVersion: stock.version,
      },
      ctx("Mia"),
    );
    if (!result.ok) throw new Error(result.error);
    return result.state;
  }

  it("shows 'Order needed' with no invented number, flags it, and Fill leaves it blank", async () => {
    const { user, controls } = mount({
      initial: noParState(),
      withDraft: true,
    });
    const gin = screen
      .getAllByTestId("draft-line")
      .find((l) => l.getAttribute("data-name") === "House Rail Gin")!;
    expect(within(gin).getByTestId("draft-suggested")).toHaveTextContent(
      "Order needed",
    );
    expect(within(gin).getByText("Quantity needed")).toBeInTheDocument();
    expect(screen.getByTestId("draft-suggested-total")).toHaveTextContent(
      "9 + 1 order needed",
    );
    await user.click(
      screen.getByRole("button", { name: "Fill from Suggestions" }),
    );
    await screen.findByText("Filled from suggestions.");
    const lines = draftNow(controls).lines;
    expect(
      lines.find((l) => l.name === "Tito's Handmade Vodka")!.orderQty,
    ).toBe(9);
    expect(lines.find((l) => l.name === "House Rail Gin")!.orderQty).toBeNull();
    expect(
      within(gin).getByLabelText(/Order quantity for House Rail Gin/),
    ).toHaveValue("");
  });
});

describe("Fill from Suggestions, Update suggestions and Clear Draft", () => {
  it("fills blanks directly; with typed quantities asks first and defaults to keeping them", async () => {
    const { user, controls } = mount({ withDraft: true });
    await user.type(qty(), "12");
    await user.click(saveButton());
    await screen.findByText("Order draft saved.");
    await user.click(
      screen.getByRole("button", { name: "Fill from Suggestions" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Fill from Suggestions",
    });
    expect(
      within(dialog).getByLabelText(/Fill empty quantities only/),
    ).toBeChecked();
    await user.click(
      within(dialog).getByRole("button", { name: "Fill empty only" }),
    );
    await screen.findByText("Nothing to fill.");
    expect(draftNow(controls).lines[0]!.orderQty).toBe(12);

    await user.click(
      screen.getByRole("button", { name: "Fill from Suggestions" }),
    );
    const again = await screen.findByRole("dialog", {
      name: "Fill from Suggestions",
    });
    await user.click(within(again).getByLabelText(/Replace all/));
    await user.click(
      within(again).getByRole("button", { name: "Replace all" }),
    );
    await screen.findByText("Filled from suggestions.");
    expect(draftNow(controls).lines[0]!.orderQty).toBe(9);
  });

  it("Clear Draft confirms, then clears planning state only", async () => {
    const { user, controls } = mount({ withDraft: true });
    const stockBefore = controls.current.state().stock;
    await user.type(qty(), "5");
    await user.type(screen.getByLabelText("Vendor note"), "Call first");
    await user.click(saveButton());
    await screen.findByText("Order draft saved.");
    await user.click(screen.getByRole("button", { name: "Clear Draft" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Clear this draft?",
    });
    expect(dialog).toHaveTextContent(/stock counts are not changed/);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(draftNow(controls).lines[0]!.orderQty).toBe(5);
    await user.click(screen.getByRole("button", { name: "Clear Draft" }));
    await user.click(
      within(
        await screen.findByRole("dialog", { name: "Clear this draft?" }),
      ).getByRole("button", { name: "Clear draft" }),
    );
    await screen.findByText("Draft cleared.");
    expect(draftNow(controls).lines[0]).toMatchObject({
      orderQty: null,
      itemNote: null,
      included: true,
    });
    expect(draftNow(controls).vendorNote).toBeNull();
    expect(controls.current.state().stock).toBe(stockBefore);
    expect(qty()).toHaveValue("");
  });

  it("Update suggestions reports when nothing changed", async () => {
    const { user } = mount({ withDraft: true });
    await user.click(
      screen.getByRole("button", { name: "Update suggestions" }),
    );
    expect(
      await screen.findByText("Suggestions are already up to date."),
    ).toBeInTheDocument();
  });

  it("is blocked while there are unsaved edits (save or discard first)", async () => {
    const { user, controls } = mount({ withDraft: true });
    await user.type(qty(), "3");
    const fill = screen.getByRole("button", { name: "Fill from Suggestions" });
    expect(fill).toHaveAttribute("aria-disabled", "true");
    await user.click(fill);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Save or discard your changes first/,
    );
    expect(draftNow(controls).lines[0]!.orderQty).toBeNull();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(qty()).toHaveValue("");
    expect(fill).toHaveAttribute("aria-disabled", "false");
  });
});

describe("optimistic concurrency (PT409) — VOD-040/041/042", () => {
  const theirSave = (
    c: MutableRefObject<Controls>,
    note = "Deliver Thursday",
  ) => {
    const draft = draftNow(c);
    c.current.external((s) =>
      saveDraftDemo(
        s,
        {
          draftId: draft.id,
          expectedVersion: draft.version,
          vendorNote: note,
          lines: [],
        },
        ctx("Ben"),
      ),
    );
  };

  it("refuses the stale save, keeps my edit, and offers Reload latest", async () => {
    const { user, controls } = mount({ withDraft: true });
    await user.type(qty(), "5");
    theirSave(controls);
    await user.click(saveButton());
    const banner = await screen.findByTestId("draft-conflict");
    expect(banner).toHaveAttribute("role", "alert");
    expect(banner).toHaveTextContent("This order draft changed elsewhere.");
    expect(banner).toHaveTextContent(/Ben saved version 2/);
    expect(banner).toHaveTextContent(
      /Reload the latest version before continuing/,
    );
    // Nothing of mine was applied; my typed value is still on screen.
    expect(draftNow(controls).lines[0]!.orderQty).toBeNull();
    expect(qty()).toHaveValue("5");
    expect(screen.queryByText("Order draft saved.")).toBeNull();
    // Save stays blocked until the conflict is resolved.
    expect(saveButton()).toHaveAttribute("aria-disabled", "true");

    await user.click(
      within(banner).getByRole("button", { name: "Reload latest" }),
    );
    expect(screen.queryByTestId("draft-conflict")).toBeNull();
    expect(qty()).toHaveValue("");
    expect(screen.getByLabelText("Vendor note")).toHaveValue(
      "Deliver Thursday",
    );
    expect(controls.current.spies.reload).toHaveBeenCalled();
  });

  it("Keep my edits on the latest re-bases deliberately; their change survives", async () => {
    const { user, controls } = mount({ withDraft: true });
    await user.type(qty(), "5");
    theirSave(controls);
    await user.click(saveButton());
    const banner = await screen.findByTestId("draft-conflict");
    await user.click(
      within(banner).getByRole("button", {
        name: "Keep my edits on the latest",
      }),
    );
    expect(screen.queryByTestId("draft-conflict")).toBeNull();
    expect(qty()).toHaveValue("5");
    await user.click(saveButton());
    await screen.findByText("Order draft saved.");
    const draft = draftNow(controls);
    expect(draft.lines[0]!.orderQty).toBe(5);
    expect(draft.vendorNote).toBe("Deliver Thursday");
    expect(draft.version).toBe(3);
    // Only my changed line was re-sent.
    expect(controls.current.spies.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expectedVersion: 2,
        vendorNote: "Deliver Thursday",
        lines: [expect.objectContaining({ orderQty: 5 })],
      }),
    );
  });

  it("detects a newer version loaded under my edits and will not save over it", async () => {
    const { user, controls } = mount({ withDraft: true });
    await user.type(qty(), "5");
    theirSave(controls); // a background refresh brings v2 in while I am typing
    const banner = await screen.findByTestId("draft-conflict");
    expect(banner).toBeInTheDocument();
    await user.click(saveButton());
    expect(controls.current.spies.save).not.toHaveBeenCalled();
    expect(draftNow(controls).lines[0]!.orderQty).toBeNull();
  });

  it("a conflict with my own other session is reported quietly (status, not alert)", async () => {
    const { user, controls } = mount({ withDraft: true });
    await user.type(qty(), "5");
    const draft = draftNow(controls);
    controls.current.external((s) =>
      saveDraftDemo(
        s,
        {
          draftId: draft.id,
          expectedVersion: 1,
          vendorNote: "From my phone",
          lines: [],
        },
        ctx("Mia"),
      ),
    );
    const banner = await screen.findByTestId("draft-conflict");
    expect(banner).toHaveAttribute("role", "status");
    expect(banner).toHaveTextContent(/in another tab or session/);
    expect(qty()).toHaveValue("5");
  });
});

describe("unsaved-edit guard for navigation (VOD-045)", () => {
  it("tells the module about unsaved edits and can save them on request", async () => {
    const { user, controls } = mount({ withDraft: true });
    expect(controls.current.guard()?.dirty).toBe(false);
    await user.type(qty(), "4");
    expect(controls.current.guard()?.dirty).toBe(true);
    let saved = false;
    await act(async () => {
      saved = (await controls.current.guard()?.save()) ?? false;
    });
    expect(saved).toBe(true);
    expect(draftNow(controls).lines[0]!.orderQty).toBe(4);
    expect(controls.current.guard()?.dirty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// VOD-3: Copy Order, Export, Mark Sent, Drafts | Sent
// ---------------------------------------------------------------------------

const COPY_TEXT = "Faust — Order Request\n\nTito's Handmade Vodka 750 mL — 6";

/** A Faust draft with Order Qty 6 saved, ready to copy / export / send. */
async function readyToShare() {
  const mounted = mount({ withDraft: true });
  await mounted.user.type(qty(), "6");
  await mounted.user.click(saveButton());
  await screen.findByText("Order draft saved.");
  return mounted;
}

function stubClipboard(writeText: ReturnType<typeof vi.fn> | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    value: writeText ? { writeText } : undefined,
    configurable: true,
  });
}

describe("Copy Order (VOD-050/052, clipboard + fallback)", () => {
  it("copies the vendor-facing text with the Clipboard API and announces 'Order copied'", async () => {
    const { user } = await readyToShare();
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    await user.click(screen.getByRole("button", { name: /Copy Order/ }));
    expect(writeText).toHaveBeenCalledWith(COPY_TEXT);
    expect(screen.getByTestId("copy-status")).toHaveTextContent("Order copied");
    expect(screen.queryByTestId("copy-fallback")).toBeNull();
    // Suggested (9) is internal: the vendor text never carries it.
    expect(writeText.mock.calls[0]![0]).not.toMatch(/suggest|9/i);
  });

  it("shows a visible, selected fallback when the Clipboard API refuses", async () => {
    const { user } = await readyToShare();
    stubClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    await user.click(screen.getByRole("button", { name: /Copy Order/ }));
    const fallback = await screen.findByTestId("copy-fallback");
    expect(within(fallback).getByRole("alert")).toHaveTextContent(
      /couldn't copy this automatically/,
    );
    const box = within(fallback).getByLabelText("Order text to copy");
    expect(box).toHaveValue(COPY_TEXT);
    expect(box).toHaveAttribute("readonly");
    expect(screen.getByTestId("copy-status")).toHaveTextContent("");
  });

  it("shows the same fallback when there is no Clipboard API at all", async () => {
    const { user } = await readyToShare();
    stubClipboard(undefined);
    await user.click(screen.getByRole("button", { name: /Copy Order/ }));
    expect(await screen.findByTestId("copy-fallback")).toBeInTheDocument();
    expect(screen.getByLabelText("Order text to copy")).toHaveValue(COPY_TEXT);
  });

  it("is unavailable, with the reason, until a line has a quantity (VOD-053)", async () => {
    const { user } = mount({ withDraft: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    const copy = screen.getByRole("button", { name: /Copy Order/ });
    expect(copy).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText("Add a quantity to at least one included line."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export order/ })).toBeDisabled();
    await user.click(copy);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("asks for a Save while there are unsaved edits, so Copy matches what is stored", async () => {
    const { user } = await readyToShare();
    await user.type(qty(), "0");
    expect(
      screen.getByText(
        /Save your changes first\. Copy and Export use the saved order/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copy Order/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("button", { name: /Export order/ })).toBeDisabled();
  });
});

describe("Export order (VOD-060/063/064)", () => {
  it("asks only for the draft id and the format, and downloads what comes back", async () => {
    const { user, controls } = await readyToShare();
    runExport.mockClear();
    vi.mocked(downloadFile).mockClear();
    await user.click(screen.getByRole("button", { name: /Export order/ }));
    await user.click(screen.getByRole("button", { name: "Download CSV" }));
    expect(runExport).toHaveBeenCalledWith(
      { kind: "order_draft", draftId: draftNow(controls).id },
      "csv",
    );
    expect(downloadFile).toHaveBeenCalledWith("order.csv", "x", "text/csv");

    await user.click(screen.getByRole("button", { name: /Export order/ }));
    await user.click(
      screen.getByRole("button", { name: "Download Excel (.xlsx)" }),
    );
    expect(runExport).toHaveBeenLastCalledWith(
      { kind: "order_draft", draftId: draftNow(controls).id },
      "xlsx",
    );
  });
});

describe("Mark Sent (VOD-070/071/076)", () => {
  it("needs a quantity first, and says so", async () => {
    const { user, controls } = mount({ withDraft: true });
    await user.click(screen.getByRole("button", { name: "Mark Sent" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Add a quantity before marking this order sent.",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(controls.current.spies.markSent).not.toHaveBeenCalled();
  });

  it("is blocked while edits are unsaved", async () => {
    const { user, controls } = await readyToShare();
    await user.type(qty(), "0");
    await user.click(screen.getByRole("button", { name: "Mark Sent" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Save or discard your changes first.",
    );
    expect(controls.current.spies.markSent).not.toHaveBeenCalled();
  });

  it("confirms in plain words: outside The Lineup, no inventory change, read-only, nothing is sent", async () => {
    const { user, controls } = await readyToShare();
    await user.click(screen.getByRole("button", { name: "Mark Sent" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Mark this order as sent?",
    });
    expect(dialog).toHaveTextContent(/outside The Lineup/);
    expect(dialog).toHaveTextContent(/read-only/);
    expect(dialog).toHaveTextContent(
      /not receive inventory or change your stock/,
    );
    expect(dialog).toHaveTextContent(/does not send anything/);
    expect(dialog).toHaveTextContent(/1 line · planned total 6 units/);
    expect(dialog).not.toHaveTextContent(/email it|sent to the vendor/i);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(controls.current.spies.markSent).not.toHaveBeenCalled();
    expect(draftNow(controls).status).toBe("draft");
  });

  it("sends the reviewed version, moves to the read-only Sent order and focuses it", async () => {
    const { user, controls } = await readyToShare();
    const reviewed = draftNow(controls).version;
    const draftId = draftNow(controls).id;
    const stockBefore = controls.current.state().stock;
    await user.click(screen.getByRole("button", { name: "Mark Sent" }));
    await user.click(
      within(
        await screen.findByRole("dialog", { name: "Mark this order as sent?" }),
      ).getByRole("button", { name: "Yes, mark as sent" }),
    );
    expect(controls.current.spies.markSent).toHaveBeenCalledWith(
      draftId,
      reviewed,
    );
    const order = await screen.findByTestId("sent-order");
    expect(screen.getByTestId("sent-notice")).toHaveTextContent(
      "Order marked sent. It is now read-only, and your inventory was not changed.",
    );
    expect(screen.getByTestId("sent-meta")).toHaveTextContent(
      "Sent by Mia on Oct 27, 2026, 12:00 PM",
    );
    expect(
      within(order).getByRole("heading", { name: "Faust", level: 2 }),
    ).toHaveFocus();
    // Stock was not touched, and the Sent switch is on.
    expect(controls.current.state().stock).toBe(stockBefore);
    expect(screen.getByRole("button", { name: "Sent" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("refuses a stale send with the plain message and does not send a newer draft", async () => {
    const { user, controls } = await readyToShare();
    const reviewed = draftNow(controls);
    await user.click(screen.getByRole("button", { name: "Mark Sent" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Mark this order as sent?",
    });
    // Another manager saves while the confirmation is open.
    controls.current.external((state) =>
      saveDraftDemo(
        state,
        {
          draftId: reviewed.id,
          expectedVersion: reviewed.version,
          vendorNote: "Changed elsewhere",
          lines: [],
        },
        ctx("Jo"),
      ),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Yes, mark as sent" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This order draft changed elsewhere. Reload the latest version before marking it sent.",
    );
    expect(controls.current.spies.markSent).toHaveBeenCalledWith(
      reviewed.id,
      reviewed.version,
    );
    expect(draftNow(controls).status).toBe("draft");
    expect(screen.queryByTestId("sent-order")).toBeNull();
  });

  it("an already-sent order reports who sent it instead of recording a second send", async () => {
    const { user, controls } = await readyToShare();
    await user.click(screen.getByRole("button", { name: "Mark Sent" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Mark this order as sent?",
    });
    // Another manager sends it first (this screen has not read that yet).
    const reviewed = draftNow(controls);
    controls.current.externalQuiet((state) =>
      markSentDemo(
        state,
        { draftId: reviewed.id, expectedVersion: reviewed.version },
        ctx("Jo"),
      ),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Yes, mark as sent" }),
    );
    expect(await screen.findByTestId("sent-notice")).toHaveTextContent(
      "Already marked sent by Jo at Oct 27, 2026, 12:00 PM. Nothing was changed.",
    );
    expect(
      draftsOf(controls.current.state()).filter((d) => d.status === "sent"),
    ).toHaveLength(1);
  });

  it("lets the manager open a new draft for the same vendor afterwards (VOD-005)", async () => {
    const { user } = await readyToShare();
    await user.click(screen.getByRole("button", { name: "Mark Sent" }));
    await user.click(
      within(
        await screen.findByRole("dialog", { name: "Mark this order as sent?" }),
      ).getByRole("button", { name: "Yes, mark as sent" }),
    );
    await screen.findByTestId("sent-order");
    await user.click(screen.getByRole("button", { name: "Drafts" }));
    const options = within(screen.getByLabelText("Start a draft for"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options).toEqual(["Del Papa", "Faust"]);
    expect(screen.getByText(/No order drafts yet/)).toBeInTheDocument();
  });
});

describe("Drafts | Sent switch and the read-only Sent order (VOD-080/081)", () => {
  it("is a labelled pair of toggle buttons, Drafts by default, with an empty Sent state", async () => {
    const { user } = mount({ withDraft: true });
    const group = screen.getByRole("group", {
      name: "Order drafts or sent orders",
    });
    const drafts = within(group).getByRole("button", { name: "Drafts" });
    const sent = within(group).getByRole("button", { name: "Sent" });
    expect(drafts).toHaveAttribute("aria-pressed", "true");
    expect(sent).toHaveAttribute("aria-pressed", "false");
    await user.click(sent);
    expect(sent).toHaveAttribute("aria-pressed", "true");
    expect(drafts).toHaveAttribute("aria-pressed", "false");
    expect(
      await screen.findByText(/No orders have been marked sent yet/),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("order-draft-editor")).toBeNull();
    await user.click(drafts);
    expect(await screen.findByTestId("order-draft-editor")).toBeInTheDocument();
  });

  it("opens a Sent order read-only: no inputs, frozen label, Suggested (at draft) beside Ordered, notes, and Copy/Export", async () => {
    const { user } = await readyToShare();
    await user.type(
      screen.getByLabelText(/Item note for Tito's/),
      "weekend stock",
    );
    await user.type(screen.getByLabelText("Vendor note"), "Deliver Thursday.");
    await user.click(saveButton());
    await screen.findByText("Order draft saved.");
    await user.click(screen.getByRole("button", { name: "Mark Sent" }));
    await user.click(
      within(
        await screen.findByRole("dialog", { name: "Mark this order as sent?" }),
      ).getByRole("button", { name: "Yes, mark as sent" }),
    );
    const order = await screen.findByTestId("sent-order");

    // No editing control of any kind is rendered (not merely disabled).
    expect(order.querySelectorAll("input, textarea, select")).toHaveLength(0);
    for (const name of [
      "Save",
      "Fill from Suggestions",
      "Update suggestions",
      "Clear Draft",
      "Mark Sent",
    ]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    const line = within(order).getByTestId("sent-line");
    expect(line).toHaveTextContent("Tito's Handmade Vodka 750 mL");
    expect(line).toHaveTextContent("Suggested (at draft)9");
    expect(line).toHaveTextContent("Ordered6");
    expect(line).toHaveTextContent("weekend stock");
    expect(screen.getByTestId("sent-vendor-note")).toHaveTextContent(
      "Deliver Thursday.",
    );
    expect(order).toHaveTextContent("Suggested total (at draft)");
    // Copy and Export remain.
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    await user.click(within(order).getByRole("button", { name: /Copy Order/ }));
    expect(writeText).toHaveBeenCalledWith(
      "Faust — Order Request\n\nTito's Handmade Vodka 750 mL — 6 (weekend stock)\n\nNotes:\nDeliver Thursday.",
    );
    expect(
      within(order).getByRole("button", { name: /Export order/ }),
    ).toBeEnabled();
    // Back to the list.
    await user.click(
      within(order).getByRole("button", { name: /Back to sent orders/ }),
    );
    const row = await screen.findByTestId("sent-row");
    expect(row).toHaveTextContent("Faust");
    expect(row).toHaveTextContent("Mia");
    expect(row).toHaveTextContent("Oct 27, 2026, 12:00 PM");
    expect(row).toHaveTextContent(/1/);
    expect(row).toHaveTextContent("6");
  });
});

describe("Sent history list: newest first, paged, in the location's time zone (VOD-080)", () => {
  function sentHistory(count: number): CatalogState {
    const base = buildDemoCatalog();
    const product = base.products[0]!;
    return {
      ...base,
      orderDrafts: Array.from({ length: count }, (_, i) => ({
        id: `sent-${String(i + 1).padStart(3, "0")}`,
        vendorId: base.vendors[0]!.id,
        vendorName: `Vendor ${i + 1}`,
        status: "sent" as const,
        vendorNote: null,
        version: 2,
        updatedAt: "2026-10-01T00:00:00Z",
        updatedByName: "Mia",
        // 01:30 UTC is the evening before in New York.
        sentAt: new Date(Date.UTC(2026, 9, 1, 1, 30 + i)).toISOString(),
        sentByName: "Mia",
        lines: [
          {
            productId: product.id,
            name: product.name,
            size: product.size,
            unit: "Bottle",
            sku: null,
            suggestedQty: 4,
            totalAtSnapshot: 2,
            parAtSnapshot: 6,
            statusAtSnapshot: "critical",
            orderQty: 3,
            included: true,
            itemNote: null,
          },
        ],
      })),
    };
  }

  it("shows vendor, sent time in the location time zone, sent by, line count and planned total", async () => {
    const { user } = mount({ initial: sentHistory(1) });
    await user.click(screen.getByRole("button", { name: "Sent" }));
    const row = await screen.findByTestId("sent-row");
    expect(row).toHaveTextContent("Vendor 1");
    // 2026-10-01 01:30 UTC is Sep 30, 9:30 PM in New York: never the raw UTC.
    expect(row).toHaveTextContent("Sep 30, 2026, 9:30 PM");
    expect(row).not.toHaveTextContent("01:30");
    expect(row).not.toHaveTextContent("UTC");
    expect(row).toHaveTextContent("Mia");
    expect(screen.getByTestId("sent-page-status")).toHaveTextContent(
      "Page 1 of 1 · 1–1 of 1 sent order",
    );
  });

  it("pages explicitly, newest first, with working Previous and Next", async () => {
    const { user } = mount({ initial: sentHistory(45) });
    await user.click(screen.getByRole("button", { name: "Sent" }));
    const names = () =>
      screen
        .getAllByTestId("sent-row")
        .map((row) => row.getAttribute("data-vendor"));
    await screen.findAllByTestId("sent-row");

    expect(names()).toHaveLength(20);
    // Highest number = most recently sent = first.
    expect(names()[0]).toBe("Vendor 45");
    expect(names().at(-1)).toBe("Vendor 26");
    expect(screen.getByTestId("sent-page-status")).toHaveTextContent(
      "Page 1 of 3 · 1–20 of 45 sent orders",
    );
    const previous = screen.getByRole("button", { name: "Previous page" });
    const next = screen.getByRole("button", { name: "Next page" });
    expect(previous).toHaveAttribute("aria-disabled", "true");
    expect(next).toHaveAttribute("aria-disabled", "false");

    await user.click(next);
    await waitFor(() => expect(names()[0]).toBe("Vendor 25"));
    expect(names().at(-1)).toBe("Vendor 6");
    expect(screen.getByTestId("sent-page-status")).toHaveTextContent(
      "Page 2 of 3 · 21–40 of 45 sent orders",
    );

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(names()).toHaveLength(5));
    expect(names()).toEqual([
      "Vendor 5",
      "Vendor 4",
      "Vendor 3",
      "Vendor 2",
      "Vendor 1",
    ]);
    expect(screen.getByRole("button", { name: "Next page" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Previous page" }));
    await waitFor(() => expect(names()).toHaveLength(20));
    expect(names()[0]).toBe("Vendor 25");
  });
});
